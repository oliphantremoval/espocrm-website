import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createOwnerLoginLink } from "@/lib/crm-auth-core";
import { isSameOrigin, ownerEmailAuthConfig, privateHeaders } from "@/lib/crm-auth";

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
    const form = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    const values = form.getAll("email");
    if (values.length !== 1 || values[0].length > MAX_EMAIL_LENGTH) return null;
    return values[0].trim().toLowerCase();
  } finally {
    reader.releaseLock();
  }
}

function loginPageUrl(request: Request, search: string): URL {
  return new URL(`/crm/login${search}`, request.url);
}

function configuredPublicUrl(): URL | null {
  const value = process.env.CRM_PUBLIC_URL;
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const config = ownerEmailAuthConfig();
  const smtpEmail = process.env.SMTP_EMAIL;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const publicUrl = configuredPublicUrl();
  if (!config || !smtpEmail || !smtpPassword || !publicUrl) {
    return new NextResponse("Not found", { status: 404, headers: privateHeaders });
  }
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
  if (!allowAttempt(request)) {
    return NextResponse.redirect(loginPageUrl(request, "?error=limited"), {
      status: 303,
      headers: { ...privateHeaders, "Retry-After": "900" },
    });
  }

  try {
    const submittedEmail = await readEmail(request);
    if (submittedEmail !== config.ownerEmail) {
      return NextResponse.redirect(loginPageUrl(request, "?sent=1"), { status: 303, headers: privateHeaders });
    }

    const loginUrl = new URL("/crm/auth/verify", publicUrl);
    loginUrl.searchParams.set("token", createOwnerLoginLink(config));
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: smtpEmail, pass: smtpPassword },
    });
    await transporter.sendMail({
      from: smtpEmail,
      to: config.ownerEmail,
      subject: "Your secure Oliphant Removal owner sign-in link",
      text: `Use this private link to sign in to your Oliphant Removal workspace. It expires in 15 minutes.\n\n${loginUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Oliphant Removal owner sign-in</h2><p>Use the secure link below to sign in to your workspace. It expires in 15 minutes.</p><p><a href="${loginUrl.toString()}">Sign in to your workspace</a></p><p style="color:#5b6471">If you did not request this, you can ignore this email.</p></div>`,
    });
    return NextResponse.redirect(loginPageUrl(request, "?sent=1"), { status: 303, headers: privateHeaders });
  } catch (error) {
    console.error("Owner sign-in link delivery failed:", error);
    return NextResponse.redirect(loginPageUrl(request, "?error=email"), { status: 303, headers: privateHeaders });
  }
}

