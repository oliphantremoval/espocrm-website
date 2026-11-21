import { NextResponse } from "next/server";
import { ownerAuthConfig, ownerIsSignedIn, privateHeaders } from "@/lib/crm-auth";

export const runtime = "nodejs";

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_LEADS = 50;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeLead(value: RecordValue) {
  const firstName = text(value.firstName, 100);
  const lastName = text(value.lastName, 100);
  const name = [firstName, lastName].filter(Boolean).join(" ") || text(value.name, 200) || "Website lead";

  return {
    id: text(value.id, 160),
    name,
    email: text(value.emailAddress ?? value.email, 254),
    phone: text(value.phoneNumber ?? value.phone, 80),
    company: text(value.accountName, 300),
    description: text(value.description, 5_000),
    status: text(value.status, 100) || "New lead",
    createdAt: text(value.createdAt, 80),
  };
}

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: privateHeaders });
}

export async function GET() {
  const config = ownerAuthConfig();
  if (!config || !(await ownerIsSignedIn(config))) {
    return new NextResponse("Unauthorized", { status: 401, headers: privateHeaders });
  }

  const crmUrl = process.env.ESPOCRM_URL;
  const apiKey = process.env.ESPOCRM_API_KEY;
  if (!crmUrl || !apiKey) {
    return response({ error: "Website lead syncing is not configured yet." }, 503);
  }

  let endpoint: URL;
  try {
    const base = new URL(crmUrl);
    if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("invalid CRM URL");
    endpoint = new URL(`${base.toString().replace(/\/$/, "")}/Lead`);
    endpoint.searchParams.set("maxSize", String(MAX_LEADS));
    endpoint.searchParams.set("orderBy", "createdAt");
    endpoint.searchParams.set("order", "desc");
    endpoint.searchParams.set("select", "id,firstName,lastName,emailAddress,phoneNumber,accountName,status,description,createdAt");
  } catch {
    return response({ error: "Website lead syncing is unavailable right now." }, 503);
  }

  try {
    const upstream = await fetch(endpoint, {
      headers: { Accept: "application/json", "X-Api-Key": apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      console.error("Website lead sync failed:", upstream.status);
      return response({ error: "Website lead syncing is unavailable right now." }, 503);
    }
    const declaredLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      return response({ error: "Website lead response was too large." }, 503);
    }

    const payload: unknown = await upstream.json();
    if (!isRecord(payload) || !Array.isArray(payload.list)) {
      return response({ error: "Website lead syncing returned an unexpected response." }, 503);
    }
    const list = payload.list.filter(isRecord).slice(0, MAX_LEADS).map(normalizeLead).filter((lead) => lead.id);
    const total = typeof payload.total === "number" && Number.isFinite(payload.total) && payload.total >= 0
      ? Math.floor(payload.total)
      : list.length;

    return response({ list, total });
  } catch {
    return response({ error: "Website lead syncing is unavailable right now." }, 503);
  }
}

