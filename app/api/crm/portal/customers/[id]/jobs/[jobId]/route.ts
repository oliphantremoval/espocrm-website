import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { currentCrmActor } from "@/lib/crm-team-auth";
import { readSmallBody } from "@/lib/portal-auth";
import { portalDb, portalJob, uuid, validatePublishedJob } from "@/lib/portal-db";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });
type Context = { params: Promise<{ id: string; jobId: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!(await currentCrmActor())) return json({ error: "Unauthorized" }, 401);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const { id, jobId } = await context.params;
  if (!uuid(id) || !uuid(jobId)) return json({ error: "Invalid record." }, 400);
  try {
    const { title, service, status, date, time, description } = validatePublishedJob(JSON.parse(await readSmallBody(request, 10_000)));
    const sql = portalDb();
    const rows = await sql`UPDATE portal_jobs SET title=${title},service=${service},status=${status},scheduled_date=${date},scheduled_time=${time},description=${description} WHERE customer_id=${id} AND id=${jobId} RETURNING id,title,service,status,scheduled_date,scheduled_time,description`;
    return rows.length ? json({ job: portalJob(rows[0]) }) : json({ error: "Job not found." }, 404);
  } catch { return json({ error: "Job could not be updated. Check the fields and storage connection." }, 400); }
}

export async function DELETE(request: Request, context: Context) {
  if (!(await currentCrmActor())) return json({ error: "Unauthorized" }, 401);
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const { id, jobId } = await context.params;
  if (!uuid(id) || !uuid(jobId)) return json({ error: "Invalid record." }, 400);
  try { const sql = portalDb(); const rows = await sql`DELETE FROM portal_jobs WHERE customer_id=${id} AND id=${jobId} RETURNING id`; return rows.length ? json({ deleted: true }) : json({ error: "Job not found." }, 404); }
  catch { return json({ error: "Could not remove published job." }, 503); }
}
