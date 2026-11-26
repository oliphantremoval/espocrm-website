import { after, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { isSameOrigin } from "@/lib/crm-auth";
import { allowLoginRequest, newToken, portalHeaders, readSmallBody, tokenHash } from "@/lib/portal-auth";
import { emailAddress, portalDb } from "@/lib/portal-db";

export const runtime = "nodejs";
const redirect = (request: Request, suffix: string) => NextResponse.redirect(new URL(`/portal/login${suffix}`, request.url), { status: 303, headers: portalHeaders });

export async function POST(request: Request) {
  const started = Date.now();
  async function generic() {
    const wait = Math.max(0, 1500 - (Date.now() - started));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    return redirect(request, "?sent=1");
  }
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: portalHeaders });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return redirect(request, "?sent=1");
  const mailUser = process.env.SMTP_EMAIL, mailPassword = process.env.SMTP_PASSWORD, publicUrl = process.env.CRM_PUBLIC_URL;
  if (!mailUser || !mailPassword || !publicUrl || !(process.env.ORSTORAGE_DATABASE_URL ?? process.env.DATABASE_URL) || process.env.VERCEL_ENV === "preview") return redirect(request, "?error=unavailable");
  let origin: URL;
  try { origin = new URL(publicUrl); if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) throw new Error(); }
  catch { return redirect(request, "?error=unavailable"); }
  try {
    const form = new URLSearchParams(await readSmallBody(request, 4096));
    const values = form.getAll("email");
    if (values.length !== 1) return generic();
    let email: string;
    try { email = emailAddress(values[0]); } catch { return generic(); }
    if (!(await allowLoginRequest(request, email))) return redirect(request, "?error=limited");
    const sql = portalDb();
    const token = newToken();
    const rows = await sql`INSERT INTO portal_login_links (token_hash, customer_id, access_version, expires_at) SELECT ${tokenHash(token)}, id, access_version, now() + interval '15 minutes' FROM portal_customers WHERE email = ${email} AND enabled = true RETURNING customer_id`;
    if (rows.length) {
      const url = new URL("/api/portal/auth/verify", origin);
      url.searchParams.set("token", token);
      // Send after the same generic response is returned, so mail-provider timing
      // does not reveal which email addresses belong to customers.
      after(async () => {
        try {
          const testPort = process.env.NODE_ENV !== "production" ? Number(process.env.PORTAL_TEST_SMTP_PORT) : 0;
          const transporter = nodemailer.createTransport(testPort > 0 && testPort < 65536
            ? { host: "127.0.0.1", port: testPort, secure: false, ignoreTLS: true }
            : { host: "smtp.gmail.com", port: 587, secure: false, auth: { user: mailUser, pass: mailPassword }, connectionTimeout: 10_000, socketTimeout: 10_000 });
          await transporter.sendMail({ from: mailUser, to: email, subject: "Your Oliphant Removal customer portal sign-in", text: `Use this link to sign in to your customer portal. It expires in 15 minutes.\n\n${url.toString()}\n\nIf you did not request it, you can ignore this email.` });
        } catch {
          console.error("Customer portal sign-in email delivery failed.");
        }
      });
    }
    return generic();
  } catch {
    // Do not disclose whether an address exists or whether mail was delivered.
    return generic();
  }
}

