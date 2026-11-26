import { NextResponse } from "next/server";
import { createOwnerLoginLink } from "@/lib/crm-auth-core";
import { isSameOrigin, ownerAuthConfig, privateHeaders } from "@/lib/crm-auth";
import { crmMailConfig, normalizeTeamEmail, queueTeamSignInLink, sendCrmMail, teamMailConfig } from "@/lib/crm-team-auth";
import { readSmallBody } from "@/lib/portal-auth";

export const runtime = "nodejs";

const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 3;
const MAX_BODY_BYTES = 4_096;
const MAX_EMAIL_LENGTH = 254;
// This is an instance-local safeguard. A durable rate limit is added with the CRM database.
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

async function readEmail(request: Request): Promise<string | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return null;
  const body = await readSmallBody(request, MAX_BODY_BYTES).catch(() => null);
  if (body === null) return null;
  const values = new URLSearchParams(body).getAll("email");
  return values.length === 1 && values[0].length <= MAX_EMAIL_LENGTH ? values[0].trim().toLowerCase() : null;
}

function redirectToLogin(request: Request, search: string, retryAfter?: string) {
  return NextResponse.redirect(new URL(`/crm/login${search}`, request.url), {
    status: 303,
    headers: retryAfter ? { ...privateHeaders, "Retry-After": retryAfter } : privateHeaders,
  });
}

export async function POST(request: Request) {
  const config = ownerAuthConfig();
  const mail = config?.mode === "email" ? crmMailConfig() : teamMailConfig();
  if (!config || !mail) {
    return new NextResponse("Not found", { status: 404, headers: privateHeaders });
  }
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });

  try {
    const submittedEmail = await readEmail(request);
    if (config.mode === "email" && submittedEmail === config.credentials.ownerEmail) {
      if (!allowAttempt(request)) return redirectToLogin(request, "?error=limited", "900");

      const loginUrl = new URL("/crm/auth/verify", mail.publicUrl);
      loginUrl.searchParams.set("token", createOwnerLoginLink(config.credentials));
      await sendCrmMail(
        mail,
        submittedEmail,
        "Your secure Oliphant Removal owner sign-in link",
        `Use this private link to sign in to your Oliphant Removal workspace. It expires in 15 minutes.\n\n${loginUrl}\n\nIf you did not request this, you can ignore this email.`,
        `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Oliphant Removal owner sign-in</h2><p>Use the secure link below to sign in to your workspace. It expires in 15 minutes.</p><p><a href="${loginUrl}">Sign in to your workspace</a></p><p style="color:#5b6471">If you did not request this, you can ignore this email.</p></div>`,
      );
    } else {
      const email = normalizeTeamEmail(submittedEmail);
      if (email && !(await queueTeamSignInLink(request, email))) {
        return redirectToLogin(request, "?error=limited", "3600");
      }
    }
    return redirectToLogin(request, "?sent=1");
  } catch {
    console.error("CRM sign-in link could not be requested.");
    return redirectToLogin(request, "?error=email");
  }
}
