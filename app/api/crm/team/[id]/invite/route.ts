import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { allowTeamInvite, currentCrmIdentity, sendCrmMail, teamMailConfig } from "@/lib/crm-team-auth";
import { portalDb, uuid } from "@/lib/portal-db";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: privateHeaders });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return json({ error: "Forbidden." }, 403);
  try {
    const identity = await currentCrmIdentity();
    if (!identity) return json({ error: "Sign in to continue." }, 401);
    if (identity.actor.role === "manager") return json({ error: "Only owners can send team invitations." }, 403);
    const { id } = await params;
    if (!uuid(id)) return json({ error: "Team member not found." }, 404);

    const sql = portalDb();
    const [member] = await sql`
      SELECT email FROM crm_team_members AS target
      WHERE target.id = ${id} AND target.enabled AND (
        ${identity.actor.role === "primary"}::boolean OR (target.role = 'manager' AND EXISTS (
          SELECT 1 FROM crm_team_sessions AS s
          JOIN crm_team_members AS m ON m.id = s.member_id
          WHERE s.token_hash = ${identity.teamSessionHash} AND s.expires_at > now()
            AND m.enabled AND m.access_version = s.access_version AND m.role = 'co-owner'
        ))
      )
    `;
    if (!member) return json({ error: "This team member is inactive or cannot be invited by your account." }, 404);
    const mail = teamMailConfig();
    if (!mail) return json({ error: "Email delivery is unavailable. You can copy and share the sign-in link." }, 503);
    if (!(await allowTeamInvite(identity.actor.email, member.email))) {
      return json({ error: "Too many invitations were sent recently. You can copy and share the sign-in link." }, 429);
    }
    const login = new URL("/crm/login", mail.publicUrl);
    await sendCrmMail(mail, member.email, "You’re invited to the Oliphant Removal CRM", `You have access to the Oliphant Removal CRM. Open the sign-in page and enter this email address. The CRM will send you a one-time sign-in link.\n\n${login}`);
    return json({ sent: true });
  } catch {
    return json({ error: "The invitation email could not be sent. You can copy and share the sign-in link." }, 503);
  }
}
