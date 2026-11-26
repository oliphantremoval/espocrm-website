import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/crm-auth";
import { newToken, portalCookie, portalCookieOptions, portalHeaders, readSmallBody, tokenHash, validToken } from "@/lib/portal-auth";
import { portalDb } from "@/lib/portal-db";

export const runtime = "nodejs";
const invalid = (request: Request) => NextResponse.redirect(new URL("/portal/login?error=link", request.url), { status: 303, headers: portalHeaders });

export async function GET(request: Request) {
  const tokens = new URL(request.url).searchParams.getAll("token");
  if (tokens.length !== 1 || !validToken(tokens[0])) return invalid(request);
  // The token alphabet is restricted to base64url, so it is safe in this hidden field.
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirm sign-in | Oliphant Removal</title></head><body style="font-family:Arial,sans-serif;background:#f4f7f1;color:#233e2e;padding:12vh 20px"><main style="max-width:420px;margin:auto;background:white;padding:32px;border-radius:12px"><h1>Confirm your sign-in</h1><p>Continue to your Oliphant Removal customer portal.</p><form method="post" action="/api/portal/auth/verify"><input type="hidden" name="token" value="${tokens[0]}"><button style="background:#285d45;color:white;border:0;border-radius:6px;padding:14px 20px;font-size:16px" type="submit">Continue securely</button></form></main></body></html>`;
  return new NextResponse(html, { headers: { ...portalHeaders, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: portalHeaders });
  try {
    const form = new URLSearchParams(await readSmallBody(request, 2048));
    const tokens = form.getAll("token");
    if (tokens.length !== 1 || !validToken(tokens[0])) return invalid(request);
    const session = newToken();
    const sql = portalDb();
    // Lock the customer so disabling access cannot race with session creation.
    const rows = await sql`WITH locked AS (SELECT c.id,c.access_version FROM portal_customers c JOIN portal_login_links l ON l.customer_id = c.id WHERE l.token_hash = ${tokenHash(tokens[0])} AND c.enabled = true AND l.access_version = c.access_version FOR UPDATE OF c), used AS (UPDATE portal_login_links SET consumed_at = now() WHERE token_hash = ${tokenHash(tokens[0])} AND consumed_at IS NULL AND expires_at > now() AND customer_id IN (SELECT id FROM locked) RETURNING customer_id), created AS (INSERT INTO portal_sessions (token_hash,customer_id,access_version,expires_at) SELECT ${tokenHash(session)},used.customer_id,locked.access_version,now() + interval '24 hours' FROM used JOIN locked ON locked.id=used.customer_id RETURNING customer_id) SELECT customer_id FROM created`;
    if (!rows.length) return invalid(request);
    const result = NextResponse.redirect(new URL("/portal", request.url), { status: 303, headers: portalHeaders });
    result.cookies.set(portalCookie, session, portalCookieOptions);
    return result;
  } catch { return invalid(request); }
}

