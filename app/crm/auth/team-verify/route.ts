import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders, sessionCookieName, sessionCookieOptions } from "@/lib/crm-auth";
import { clearTeamSession, consumeTeamLink, teamSessionCookie, teamSessionOptions } from "@/lib/crm-team-auth";
import { readSmallBody, validToken } from "@/lib/portal-auth";

export const runtime = "nodejs";

const headers = { ...privateHeaders, "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

function invalidLink(request: Request) {
  return NextResponse.redirect(new URL("/crm/login?error=link", request.url), { status: 303, headers });
}

export async function GET(request: Request) {
  const tokens = new URL(request.url).searchParams.getAll("token");
  if (tokens.length !== 1 || !validToken(tokens[0])) return invalidLink(request);

  // Only a form submission consumes the token, so email link scanners can open this page safely.
  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Confirm CRM sign-in | Oliphant Removal</title>
      </head>
      <body style="font:16px Arial,sans-serif;background:#f3f5ef;color:#20372b;padding:12vh 20px">
        <main style="box-sizing:border-box;max-width:440px;margin:auto;background:white;padding:28px;border-radius:15px">
          <h1>Confirm your CRM sign-in</h1>
          <p>Continue to Oliphant Removal using the account this link was sent to.</p>
          <form method="post" action="/crm/auth/team-verify">
            <input type="hidden" name="token" value="${tokens[0]}">
            <button type="submit" style="background:#285d45;color:white;border:0;border-radius:7px;padding:14px 20px;font:inherit;cursor:pointer">Sign in to the CRM</button>
          </form>
        </main>
      </body>
    </html>`;
  return new NextResponse(html, {
    headers: {
      ...headers,
      "Referrer-Policy": "strict-origin",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    return invalidLink(request);
  }

  try {
    const form = new URLSearchParams(await readSmallBody(request, 2048));
    const tokens = form.getAll("token");
    if (tokens.length !== 1 || !validToken(tokens[0])) return invalidLink(request);
    const session = await consumeTeamLink(tokens[0]);
    if (!session) return invalidLink(request);

    const response = NextResponse.redirect(new URL("/crm", request.url), { status: 303, headers });
    await clearTeamSession(response);
    response.cookies.set(teamSessionCookie, session, teamSessionOptions());
    response.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0, expires: new Date(0) });
    return response;
  } catch {
    return invalidLink(request);
  }
}
