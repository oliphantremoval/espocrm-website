import { NextResponse } from "next/server";
import { createSession, SESSION_MAX_AGE_SECONDS, verifyOwnerPassword } from "@/lib/crm-auth-core";
import { isSameOrigin, ownerAuthConfig, privateHeaders, sessionCookieName, sessionCookieOptions } from "@/lib/crm-auth";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_BODY_BYTES = 16_384;
// An extra local safeguard, not a durable or distributed Vercel rate limit.
const attempts = new Map<string, { count: number; until: number }>();

function allowAttempt(request: Request): boolean {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const key = forwarded.length <= 64 && /^[0-9a-fA-F:.]+$/.test(forwarded) ? forwarded : "unknown";
  const current = attempts.get(key);
  if (current && current.count >= MAX_ATTEMPTS) return false;
  if (!current && attempts.size >= 10_000) return false;
  attempts.set(key, { count: (current?.count ?? 0) + 1, until: current?.until ?? now + WINDOW_MS });
  return true;
}

async function readPassword(request: Request): Promise<string | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const form = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(body));
    const values = form.getAll("password");
    return values.length === 1 && values[0].length <= 1024 ? values[0] : null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const config = ownerAuthConfig();
  if (!config) return new NextResponse("Not found", { status: 404, headers: privateHeaders });
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
  if (!allowAttempt(request)) {
    return new NextResponse("Too many sign-in attempts. Wait 15 minutes before trying again.", {
      status: 429,
      headers: { ...privateHeaders, "Retry-After": "900" },
    });
  }

  try {
    const password = await readPassword(request);
    if (password === null || !(await verifyOwnerPassword(password, config))) {
      return NextResponse.redirect(new URL("/crm/login?error=invalid", request.url), { status: 303, headers: privateHeaders });
    }
    const response = NextResponse.redirect(new URL("/crm", request.url), { status: 303, headers: privateHeaders });
    response.cookies.set(sessionCookieName(), createSession(config), {
      ...sessionCookieOptions(),
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    return new NextResponse("Sign-in could not be completed. Please try again later.", { status: 503, headers: privateHeaders });
  }
}
