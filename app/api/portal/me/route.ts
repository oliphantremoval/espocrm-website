import { NextResponse } from "next/server";
import { currentSessionHash, portalHeaders } from "@/lib/portal-auth";
import { portalDb } from "@/lib/portal-db";

export const runtime = "nodejs";
export async function GET() {
  try {
    const hash = await currentSessionHash();
    if (!hash) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: portalHeaders });
    const sql = portalDb();
    // Read authorization and all visible records from the same database snapshot.
    const rows = await sql`SELECT jsonb_build_object('name',c.name,'email',c.email,'phone',c.phone,'address',c.address) AS customer, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'service',j.service,'status',j.status,'scheduledDate',j.scheduled_date,'scheduledTime',j.scheduled_time,'description',j.description) ORDER BY j.created_at DESC) FROM (SELECT id,title,service,status,scheduled_date,scheduled_time,description,created_at FROM portal_jobs WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 1000) j),'[]'::jsonb) AS jobs FROM portal_sessions s JOIN portal_customers c ON c.id = s.customer_id WHERE s.token_hash = ${hash} AND s.revoked_at IS NULL AND s.expires_at > now() AND c.enabled = true AND s.access_version = c.access_version LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: portalHeaders });
    return NextResponse.json({ customer: rows[0].customer, jobs: rows[0].jobs }, { headers: portalHeaders });
  } catch { return NextResponse.json({ error: "Customer portal is unavailable." }, { status: 503, headers: portalHeaders }); }
}

