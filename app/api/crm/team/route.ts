import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isSameOrigin, ownerEmailAuthConfig, privateHeaders } from "@/lib/crm-auth";
import { currentCrmIdentity, isTeamRole, normalizeTeamEmail } from "@/lib/crm-team-auth";
import { readSmallBody } from "@/lib/portal-auth";
import { portalDb, record } from "@/lib/portal-db";

export const runtime = "nodejs";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });

export async function GET() {
  try {
    const identity = await currentCrmIdentity();
    if (!identity) return json({ error: "Sign in to continue." }, 401);
    if (identity.actor.role === "manager") return json({ error: "Team settings are available to owners." }, 403);
    const sql = portalDb();
    const members = await sql`
      SELECT id, name, email, role, enabled, last_sign_in_at AS "lastSignInAt"
      FROM crm_team_members
      WHERE ${identity.actor.role === "primary"}::boolean OR role = 'manager'
      ORDER BY enabled DESC, name, id
      LIMIT 250
    `;
    return json({ members });
  } catch {
    return json({ error: "Team settings could not be loaded. Please try again." }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);
  try {
    const identity = await currentCrmIdentity();
    if (!identity) return json({ error: "Sign in to continue." }, 401);
    if (identity.actor.role === "manager") return json({ error: "Only owners can add team members." }, 403);
    const body: unknown = await readSmallBody(request, 4096).then(JSON.parse).catch(() => null);
    if (!record(body)) return json({ error: "Enter a name, email address, and role." }, 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = normalizeTeamEmail(body.email);
    const role = body.role;
    if (!name || name.length > 100 || !email || !isTeamRole(role)) {
      return json({ error: "Enter a name of up to 100 characters, a valid email address, and a team role." }, 400);
    }
    const primary = identity.actor.role === "primary";
    if (role === "co-owner" && !primary) return json({ error: "Only the primary owner can add co-owners." }, 403);
    if (email === ownerEmailAuthConfig()?.ownerEmail) {
      return json({ error: "This email is already used by the primary owner." }, 409);
    }

    const sql = portalDb();
    const [result] = await sql`
      WITH authorized AS MATERIALIZED (
        SELECT true AS allowed WHERE ${primary}::boolean
        UNION ALL
        SELECT true FROM crm_team_sessions AS s
        JOIN crm_team_members AS m ON m.id = s.member_id
        WHERE s.token_hash = ${identity.teamSessionHash} AND s.expires_at > now()
          AND m.enabled AND m.access_version = s.access_version AND m.role = 'co-owner'
      ), created AS (
        INSERT INTO crm_team_members (id, name, email, role)
        SELECT ${randomUUID()}, ${name}, ${email}, ${role}
        WHERE EXISTS (SELECT 1 FROM authorized)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, role, enabled, last_sign_in_at AS "lastSignInAt"
      )
      SELECT EXISTS (SELECT 1 FROM authorized) AS allowed, (SELECT to_jsonb(created) FROM created) AS member
    `;
    if (!result.allowed) return json({ error: "Your team permissions changed. Sign in again to continue." }, 403);
    if (!result.member) return json({ error: "This email already has a team account." }, 409);
    return json({ member: result.member }, 201);
  } catch {
    return json({ error: "The team account could not be created. Please try again." }, 503);
  }
}
