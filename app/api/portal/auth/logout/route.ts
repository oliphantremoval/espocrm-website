import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/crm-auth";
import { portalCookie, portalCookieOptions, portalHeaders, tokenHash, validToken } from "@/lib/portal-auth";
import { portalDb } from "@/lib/portal-db";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: portalHeaders });
  const token = (await cookies()).get(portalCookie)?.value ?? "";
  if (validToken(token)) {
    try { const sql = portalDb(); await sql`UPDATE portal_sessions SET revoked_at = now() WHERE token_hash = ${tokenHash(token)} AND revoked_at IS NULL`; }
    catch { return new NextResponse("Sign-out could not be completed. Please try again.", { status: 503, headers: portalHeaders }); }
  }
  const result = NextResponse.redirect(new URL("/portal/login", request.url), { status: 303, headers: portalHeaders });
  result.cookies.set(portalCookie, "", { ...portalCookieOptions, maxAge: 0 });
  return result;
}

