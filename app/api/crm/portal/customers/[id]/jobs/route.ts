import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { currentCrmActor } from "@/lib/crm-team-auth";
import { portalDb, portalJob, uuid, validatePublishedJob } from "@/lib/portal-db";
import { readSmallBody } from "@/lib/portal-auth";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentCrmActor())) return json({ error: "Unauthorized" }, 401);
  const { id } = await context.params;
  if (!uuid(id)) return json({ error: "Invalid customer." }, 400);
  try { const sql = portalDb(); const rows = await sql`SELECT id,title,service,status,scheduled_date,scheduled_time,description FROM portal_jobs WHERE customer_id = ${id} ORDER BY created_at DESC LIMIT 1000`; return json({ jobs: rows.map(portalJob) }); }
  catch { return json({ error: "Could not load customer jobs." }, 503); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await currentCrmActor())) return json({ error: "Unauthorized" }, 401);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const { id } = await context.params;
  if (!uuid(id)) return json({ error: "Invalid customer." }, 400);
  try {
    const raw = await readSmallBody(request, 10_000);
    const { title, service, status, date, time, description } = validatePublishedJob(JSON.parse(raw));
    const sql = portalDb();
    const rows = await sql`INSERT INTO portal_jobs (id,customer_id,title,service,status,scheduled_date,scheduled_time,description) SELECT ${randomUUID()},id,${title},${service},${status},${date},${time},${description} FROM portal_customers WHERE id = ${id} RETURNING id,title,service,status,scheduled_date,scheduled_time,description`;
    return rows.length ? json({ job: portalJob(rows[0]) }, 201) : json({ error: "Customer not found." }, 404);
  } catch { return json({ error: "Job could not be published. Check the fields and storage connection." }, 400); }
}
