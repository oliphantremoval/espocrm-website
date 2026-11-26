import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { currentCrmActor } from "@/lib/crm-team-auth";
import { emailAddress, field, portalCustomer, portalDb, record } from "@/lib/portal-db";
import { readSmallBody } from "@/lib/portal-auth";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });

export async function GET() {
  if (!(await currentCrmActor())) return json({ error: "Unauthorized" }, 401);
  try {
    const sql = portalDb();
    const rows = await sql`SELECT id,name,email,phone,address,enabled FROM portal_customers ORDER BY created_at DESC LIMIT 1000`;
    return json({ customers: rows.map(portalCustomer) });
  } catch { return json({ error: "Customer portal storage is unavailable." }, 503); }
}

export async function POST(request: Request) {
  if (!(await currentCrmActor())) return json({ error: "Unauthorized" }, 401);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  try {
    const raw = await readSmallBody(request, 4096);
    const body: unknown = JSON.parse(raw);
    if (!record(body)) throw new Error("Invalid body");
    const name = field(body.name, 200, true), email = emailAddress(body.email), phone = field(body.phone, 80), address = field(body.address, 500);
    const sql = portalDb();
    const rows = await sql`INSERT INTO portal_customers (id,name,email,phone,address) VALUES (${randomUUID()},${name},${email},${phone},${address}) ON CONFLICT (email) DO NOTHING RETURNING id,name,email,phone,address,enabled`;
    return rows.length ? json({ customer: portalCustomer(rows[0]) }, 201) : json({ error: "A customer with that email already exists." }, 409);
  } catch { return json({ error: "Customer could not be saved. Check the fields and storage connection." }, 400); }
}
