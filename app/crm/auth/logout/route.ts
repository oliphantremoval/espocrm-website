import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders, sessionCookieName, sessionCookieOptions } from "@/lib/crm-auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
  const response = NextResponse.redirect(new URL("/crm/login", request.url), { status: 303, headers: privateHeaders });
  response.cookies.set(sessionCookieName(), "", {
    ...sessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
