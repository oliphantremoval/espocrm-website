import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { currentCrmIdentity, isTeamRole } from "@/lib/crm-team-auth";
import { readSmallBody } from "@/lib/portal-auth";
import { portalDb, record, uuid } from "@/lib/portal-db";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);
  try {
    const identity = await currentCrmIdentity();
    if (!identity) return json({ error: "Sign in to continue." }, 401);
    if (identity.actor.role === "manager") return json({ error: "Only owners can update team access." }, 403);
    const { id } = await params;
    if (!uuid(id)) return json({ error: "Team member not found." }, 404);
    const body: unknown = await readSmallBody(request, 2048).then(JSON.parse).catch(() => null);
    if (!record(body)) return json({ error: "Choose a role or access status." }, 400);
    const { role, enabled } = body;
    if ((role !== undefined && !isTeamRole(role)) || (enabled !== undefined && typeof enabled !== "boolean") || (role === undefined && enabled === undefined)) {
      return json({ error: "Choose a valid role or access status." }, 400);
    }

    const primary = identity.actor.role === "primary";
    if (role === "co-owner" && !primary) return json({ error: "Only the primary owner can grant co-owner access." }, 403);
    const sql = portalDb();
    const [member] = await sql`
      UPDATE crm_team_members AS target
      SET access_version = access_version + CASE
        WHEN role IS DISTINCT FROM COALESCE(${role ?? null}::text, role)
          OR enabled IS DISTINCT FROM COALESCE(${enabled ?? null}::boolean, enabled) THEN 1 ELSE 0 END,
        role = COALESCE(${role ?? null}::text, role),
        enabled = COALESCE(${enabled ?? null}::boolean, enabled)
      WHERE target.id = ${id} AND (
        ${primary}::boolean OR (target.role = 'manager' AND EXISTS (
          SELECT 1 FROM crm_team_sessions AS s
          JOIN crm_team_members AS m ON m.id = s.member_id
          WHERE s.token_hash = ${identity.teamSessionHash} AND s.expires_at > now()
            AND m.enabled AND m.access_version = s.access_version AND m.role = 'co-owner'
        ))
      )
      RETURNING id, name, email, role, enabled, last_sign_in_at AS "lastSignInAt"
    `;
    if (!member) return json({ error: "This team member cannot be changed by your account." }, 404);
    return json({ member });
  } catch {
    return json({ error: "Team access could not be updated. Please try again." }, 503);
  }
}
