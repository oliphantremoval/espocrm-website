import { NextResponse } from "next/server";
import { createEmailSession, SESSION_MAX_AGE_SECONDS, verifyOwnerLoginLink } from "@/lib/crm-auth-core";
import { ownerEmailAuthConfig, privateHeaders, sessionCookieName, sessionCookieOptions } from "@/lib/crm-auth";
import { clearTeamSession } from "@/lib/crm-team-auth";

export const runtime = "nodejs";

const redirectHeaders = { ...privateHeaders, "Referrer-Policy": "no-referrer" };

export async function GET(request: Request) {
  const config = ownerEmailAuthConfig();
  const url = new URL(request.url);
  const tokens = url.searchParams.getAll("token");
  if (!config || tokens.length !== 1 || !verifyOwnerLoginLink(tokens[0], config)) {
    return NextResponse.redirect(new URL("/crm/login?error=link", request.url), {
      status: 303,
      headers: redirectHeaders,
    });
  }

  const response = NextResponse.redirect(new URL("/crm", request.url), {
    status: 303,
    headers: redirectHeaders,
  });
  response.cookies.set(sessionCookieName(), createEmailSession(config), {
    ...sessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  await clearTeamSession(response);
  return response;
}
