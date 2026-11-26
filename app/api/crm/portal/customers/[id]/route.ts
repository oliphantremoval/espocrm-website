import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { currentCrmActor } from "@/lib/crm-team-auth";
import { emailAddress, field, portalCustomer, portalDb, record, uuid } from "@/lib/portal-db";
import { readSmallBody } from "@/lib/portal-auth";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentCrmActor())) return json({ error: "Unauthorized" }, 401);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const { id } = await context.params;
  if (!uuid(id)) return json({ error: "Invalid customer." }, 400);
  try {
    const raw = await readSmallBody(request, 1024);
    const body: unknown = JSON.parse(raw);
    if (!record(body)) return json({ error: "Invalid setting." }, 400);
    const sql = portalDb();
    if (record(body.profile)) {
      const name = field(body.profile.name, 200, true);
      const email = emailAddress(body.profile.email);
      const phone = field(body.profile.phone, 80);
      const address = field(body.profile.address, 500);
      // Changing the sign-in address revokes old access; the owner must re-enable it.
      const rows = await sql`UPDATE portal_customers SET name=${name}, email=${email}, phone=${phone}, address=${address}, enabled=CASE WHEN email <> ${email} THEN false ELSE enabled END, access_version=access_version + CASE WHEN email <> ${email} THEN 1 ELSE 0 END WHERE id=${id} RETURNING id,name,email,phone,address,enabled`;
      return rows.length ? json({ customer: portalCustomer(rows[0]) }) : json({ error: "Customer not found." }, 404);
    }
    if (typeof body.enabled !== "boolean") return json({ error: "Invalid setting." }, 400);
    // All modifications occur in one statement. Existing sessions remain revoked after re-enabling.
    const rows = await sql`WITH changed AS (UPDATE portal_customers SET enabled = ${body.enabled}, access_version = access_version + CASE WHEN ${!body.enabled} THEN 1 ELSE 0 END WHERE id = ${id} RETURNING id,name,email,phone,address,enabled), revoked_sessions AS (UPDATE portal_sessions SET revoked_at = now() WHERE customer_id = ${id} AND ${!body.enabled} AND revoked_at IS NULL), revoked_links AS (UPDATE portal_login_links SET consumed_at = now() WHERE customer_id = ${id} AND ${!body.enabled} AND consumed_at IS NULL) SELECT id,name,email,phone,address,enabled FROM changed`;
    return rows.length ? json({ customer: portalCustomer(rows[0]) }) : json({ error: "Customer not found." }, 404);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return json({ error: "A portal customer with that email already exists." }, 409);
    return json({ error: "Could not update the customer. Check the details and try again." }, 400);
  }
}
