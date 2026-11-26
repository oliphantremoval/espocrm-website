import Link from "next/link";
import type { Metadata } from "next";
import "../portal.css";

export const metadata: Metadata = {
  title: "Customer sign-in | Oliphant Removal",
  robots: { index: false, follow: false },
};

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const query = await searchParams;
  const error = query.error === "limited"
    ? "Too many requests. Please wait a little while and try again."
    : query.error === "link"
      ? "That sign-in link is invalid or expired. Please request a new one."
      : query.error === "unavailable"
        ? "We couldn’t send a sign-in link right now. Please try again later."
        : "";

  return <main className="portal-login-shell">
    <section className="portal-login-card" aria-labelledby="portal-login-title">
      <Link className="portal-brand" href="/"><span className="portal-brand-mark">OR</span><span><strong>Oliphant Removal</strong><small>Customer portal</small></span></Link>
      <div className="portal-login-body">
        <span className="portal-icon-bubble" aria-hidden="true">✦</span>
        <p className="portal-eyebrow">WELCOME BACK</p>
        <h1 id="portal-login-title">Your projects, all in one place.</h1>
        <p className="portal-intro">Enter the email address associated with your customer account. We’ll send you a secure sign-in link.</p>
        {query.sent === "1" && !error && <p className="portal-message is-success" role="status">If your email has access, a sign-in link is on its way. Check your inbox and spam folder.</p>}
        {error && <p className="portal-message is-error" role="alert">{error}</p>}
        <form action="/api/portal/auth/request-link" method="post" className="portal-login-form">
          <label htmlFor="customer-email">Email address</label>
          <input id="customer-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" />
          <button className="portal-button is-primary" type="submit">Email me a sign-in link <span aria-hidden="true">→</span></button>
        </form>
        <p className="portal-help">Need access or have a question? <a href="tel:8105425833">Call (810) 542-5833</a>.</p>
      </div>
      <div className="portal-login-footer"><Link href="/">← Back to website</Link><span>Oliphant Removal</span></div>
    </section>
  </main>;
}

