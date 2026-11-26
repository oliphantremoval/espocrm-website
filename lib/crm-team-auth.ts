import "server-only";

import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { after, type NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { ownerAuthConfig, ownerIsSignedIn, sessionCookieOptions } from "./crm-auth";
import { newToken, tokenHash, validToken } from "./portal-auth";
import { portalDb } from "./portal-db";

export type TeamRole = "co-owner" | "manager";
export type CrmActor = { role: "primary" | TeamRole; name: string; email: string };

export const teamSessionCookie = process.env.NODE_ENV === "production"
  ? "__Host-oliphant-crm-team"
  : "oliphant-crm-team";
const teamSessionAge = 8 * 60 * 60;

export function teamSessionOptions() {
  return { ...sessionCookieOptions(), maxAge: teamSessionAge };
}

export function isTeamRole(value: unknown): value is TeamRole {
  return value === "co-owner" || value === "manager";
}

export function normalizeTeamEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (local.length > 64 || !/^[a-z0-9_+!#$%&'*\/=\?^`{|}~-]+(?:\.[a-z0-9_+!#$%&'*\/=\?^`{|}~-]+)*$/.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return email;
}

async function teamSessionHash(): Promise<string | null> {
  const rawCookies = (await headers()).get("cookie") ?? "";
  const matches = rawCookies.split(";").filter(part => part.trim().split("=", 1)[0] === teamSessionCookie);
  if (matches.length !== 1) return null;
  const token = (await cookies()).get(teamSessionCookie)?.value ?? "";
  return validToken(token) ? tokenHash(token) : null;
}

type CrmIdentity = { actor: CrmActor; teamSessionHash: string | null };

export async function currentCrmIdentity(): Promise<CrmIdentity | null> {
  const owner = ownerAuthConfig();
  if (!owner) return null;
  if (await ownerIsSignedIn(owner)) {
    return {
      actor: {
        role: "primary",
        name: process.env.CRM_OWNER_NAME?.trim() || "Primary owner",
        email: owner.mode === "email" ? owner.credentials.ownerEmail : "",
      },
      teamSessionHash: null,
    };
  }

  const hash = await teamSessionHash();
  if (!hash) return null;
  const sql = portalDb();
  const [member] = await sql`
    SELECT m.name, m.email, m.role
    FROM crm_team_sessions AS s JOIN crm_team_members AS m ON m.id = s.member_id
    WHERE s.token_hash = ${hash} AND s.expires_at > now()
      AND m.enabled AND m.access_version = s.access_version
  `;
  if (!member || !isTeamRole(member.role)) return null;
  return { actor: { name: member.name, email: member.email, role: member.role }, teamSessionHash: hash };
}

export async function currentCrmActor(): Promise<CrmActor | null> {
  return (await currentCrmIdentity())?.actor ?? null;
}

export async function revokeCurrentTeamSession() {
  const hash = await teamSessionHash();
  if (!hash) return;
  const sql = portalDb();
  await sql`DELETE FROM crm_team_sessions WHERE token_hash = ${hash}`;
}

export async function clearTeamSession(response: NextResponse) {
  try {
    await revokeCurrentTeamSession();
  } catch {
    console.error("CRM team session could not be revoked.");
  }
  response.cookies.set(teamSessionCookie, "", { ...teamSessionOptions(), maxAge: 0, expires: new Date(0) });
}

export function configuredCrmPublicUrl(): URL | null {
  const value = process.env.CRM_PUBLIC_URL;
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

type CrmMailConfig = { from: string; password: string; publicUrl: URL };

export function crmMailConfig(): CrmMailConfig | null {
  const from = process.env.SMTP_EMAIL;
  const password = process.env.SMTP_PASSWORD;
  const publicUrl = configuredCrmPublicUrl();
  return from && password && publicUrl ? { from, password, publicUrl } : null;
}

export function teamMailConfig(): CrmMailConfig | null {
  return process.env.VERCEL_ENV === "preview" ? null : crmMailConfig();
}

export async function sendCrmMail(config: CrmMailConfig, recipient: string, subject: string, text: string, html?: string) {
  const testPort = process.env.NODE_ENV !== "production" ? Number(process.env.PORTAL_TEST_SMTP_PORT) : 0;
  const transporter = nodemailer.createTransport(testPort > 0 && testPort < 65536
    ? { host: "127.0.0.1", port: testPort, secure: false, ignoreTLS: true }
    : {
      host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true,
      auth: { user: config.from, pass: config.password },
      connectionTimeout: 10_000, socketTimeout: 10_000,
    });
  await transporter.sendMail({ from: config.from, to: { address: recipient, name: "" }, subject, text, html });
}

async function allowTeamEmail(firstKey: string, secondKey: string, firstLimit: number, secondLimit: number) {
  const owner = ownerAuthConfig();
  if (!owner) return false;
  const hash = (key: string) => createHmac("sha256", owner.credentials.sessionSecret).update(`crm-team-rate\0${key}`).digest("hex");
  const first = hash(firstKey);
  const second = hash(secondKey);
  const sql = portalDb();
  const rows = await sql`
    WITH first_bucket AS (
      INSERT INTO crm_team_rate_limits (key_hash, window_start, attempts)
      VALUES (${first}, date_trunc('hour', now()), 1)
      ON CONFLICT (key_hash, window_start) DO UPDATE SET attempts = crm_team_rate_limits.attempts + 1
      WHERE crm_team_rate_limits.attempts < ${firstLimit}
      RETURNING window_start
    )
    INSERT INTO crm_team_rate_limits (key_hash, window_start, attempts)
    SELECT ${second}, window_start, 1 FROM first_bucket
    ON CONFLICT (key_hash, window_start) DO UPDATE SET attempts = crm_team_rate_limits.attempts + 1
    WHERE crm_team_rate_limits.attempts < ${secondLimit}
    RETURNING attempts
  `;
  return rows.length === 1;
}

export async function allowTeamInvite(actorEmail: string, memberEmail: string) {
  return allowTeamEmail(`invite-actor\0${actorEmail}`, `invite-member\0${memberEmail}`, 30, 3);
}

async function pruneExpiredTeamAuth() {
  const sql = portalDb();
  await sql.transaction([
    sql`DELETE FROM crm_team_rate_limits WHERE (key_hash, window_start) IN (
      SELECT key_hash, window_start FROM crm_team_rate_limits
      WHERE window_start < date_trunc('hour', now()) - interval '1 hour'
      ORDER BY window_start LIMIT 500 FOR UPDATE SKIP LOCKED
    )`,
    sql`DELETE FROM crm_team_login_links WHERE token_hash IN (
      SELECT token_hash FROM crm_team_login_links WHERE expires_at <= now()
      ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
    )`,
    sql`DELETE FROM crm_team_sessions WHERE token_hash IN (
      SELECT token_hash FROM crm_team_sessions WHERE expires_at <= now()
      ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
    )`,
  ]);
}

export async function queueTeamSignInLink(request: Request, email: string): Promise<boolean> {
  const mail = teamMailConfig();
  if (!mail) return true;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ip = /^[0-9a-fA-F:.]{1,64}$/.test(forwarded) ? forwarded : "unknown";
  if (!(await allowTeamEmail(`login-ip\0${ip}`, `login-email\0${email}`, 30, 5))) return false;

  if (Math.random() < 0.02) after(() => pruneExpiredTeamAuth().catch(() => {
    console.error("Expired CRM team sign-in data could not be removed.");
  }));

  // Perform the membership lookup and email delivery after the same response
  // for known and unknown addresses so sign-in does not enumerate members.
  after(async () => {
    try {
      const sql = portalDb();
      const token = newToken();
      const rows = await sql`
        INSERT INTO crm_team_login_links (token_hash, member_id, access_version, expires_at)
        SELECT ${tokenHash(token)}, id, access_version, now() + interval '15 minutes'
        FROM crm_team_members WHERE email = ${email} AND enabled
        RETURNING member_id
      `;
      if (rows.length === 0) return;
      const link = new URL("/crm/auth/team-verify", mail.publicUrl);
      link.searchParams.set("token", token);
      await sendCrmMail(mail, email, "Your Oliphant Removal CRM sign-in link", `Use this link to sign in to the Oliphant Removal CRM. It expires in 15 minutes and works once.\n\n${link}\n\nIf you did not request this, you can ignore this email.`);
    } catch {
      console.error("CRM team sign-in email could not be sent.");
    }
  });
  return true;
}

export async function consumeTeamLink(token: string): Promise<string | null> {
  if (!ownerAuthConfig() || !validToken(token)) return null;
  const session = newToken();
  const sql = portalDb();
  const rows = await sql`
    WITH consumed AS (
      DELETE FROM crm_team_login_links
      WHERE token_hash = ${tokenHash(token)} AND expires_at > now()
      RETURNING member_id, access_version
    ), signed_in AS (
      UPDATE crm_team_members AS m SET last_sign_in_at = now()
      FROM consumed AS l
      WHERE m.id = l.member_id AND m.enabled AND m.access_version = l.access_version
      RETURNING m.id, m.access_version
    )
    INSERT INTO crm_team_sessions (token_hash, member_id, access_version, expires_at)
    SELECT ${tokenHash(session)}, id, access_version, now() + make_interval(secs => ${teamSessionAge}::int)
    FROM signed_in RETURNING member_id
  `;
  return rows.length ? session : null;
}
