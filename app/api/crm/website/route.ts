import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { currentCrmActor } from "@/lib/crm-team-auth";
import { getWebsiteContent, saveWebsiteContent } from "@/lib/website-content-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20_000;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: privateHeaders });
}

async function accessDenied() {
  const actor = await currentCrmActor();
  if (!actor) return json({ error: "Please sign in." }, 401);
  if (actor.role === "manager") return json({ error: "Only owners can edit website settings." }, 403);
  return null;
}

async function readBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("Request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Enter valid website content.");
  }
}

export async function GET() {
  const denied = await accessDenied();
  if (denied) return denied;
  return json(await getWebsiteContent());
}

export async function PUT(request: Request) {
  const denied = await accessDenied();
  if (denied) return denied;
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
  try {
    const content = await saveWebsiteContent(await readBody(request));
    return json(content);
  } catch (error) {
    const message = error instanceof Error && /^(Request is too large|Enter valid|.+must |.+between |.+digits|.+unique)/.test(error.message)
      ? error.message
      : "Website content could not be saved. Please try again.";
    return json({ error: message }, 400);
  }
}
