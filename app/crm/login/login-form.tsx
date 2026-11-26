import Image from "next/image";
import Link from "next/link";
import "./login.css";

type CrmLoginFormProps = {
  authMode?: "email" | "password";
  configured?: boolean;
  emailEnabled?: boolean;
  emailFailed?: boolean;
  emailSent?: boolean;
  invalid?: boolean;
  linkInvalid?: boolean;
  limited?: boolean;
};

export default function CrmLoginForm({
  authMode = "password",
  configured = true,
  emailEnabled = false,
  emailFailed = false,
  emailSent = false,
  invalid = false,
  linkInvalid = false,
  limited = false,
}: CrmLoginFormProps) {
  const error = limited
    ? "Too many sign-in attempts. Please wait, then try again."
    : invalid
      ? "That password was not recognized. Please try again."
      : linkInvalid
        ? "That sign-in link is invalid or has expired. Please request a new one."
        : emailFailed
          ? "We could not send a sign-in link. Please try again in a moment."
          : null;

  return (
    <main className="owner-login">
      <section className="owner-login-card" aria-labelledby="owner-login-title">
        <div className="owner-login-brand">
          <Image
            src="/logo.png"
            alt="Oliphant Removal"
            width={76}
            height={76}
            priority
          />
          <div>
            <strong>OLIPHANT</strong>
            <span>REMOVAL</span>
          </div>
        </div>

        <div className="owner-login-content">
          <span className="owner-login-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <rect x="5" y="10" width="14" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
            </svg>
          </span>
          <p className="owner-login-eyebrow">PRIVATE WORKSPACE</p>
          <h1 id="owner-login-title">{configured ? "CRM sign-in" : "CRM access is locked"}</h1>
          <p className="owner-login-intro">
            {configured
              ? emailEnabled
                ? "Enter the email address on your CRM account to receive a secure sign-in link."
                : "Enter your owner password to access the CRM."
              : "This deployment needs its CRM login settings before sign-in is available."}
          </p>

          {error && (
            <p id="owner-login-error" className="owner-login-error" role="alert" aria-live="polite">
              {error}
            </p>
          )}
          {emailSent && !error && (
            <p className="owner-login-success" role="status" aria-live="polite">
              If this address has CRM access, check its inbox for a secure sign-in link.
            </p>
          )}
          {configured && emailEnabled && <form action="/crm/auth/request-link" method="post" className="owner-login-form">
            <label htmlFor="crm-email">Email address</label>
            <input
              id="crm-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              inputMode="email"
              aria-describedby={error ? "owner-login-error" : undefined}
            />
            <button type="submit">
              Email me a sign-in link
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M5 12h14m-5-5 5 5-5 5" />
              </svg>
            </button>
          </form>}
          {configured && authMode === "password" && <form action="/crm/auth/login" method="post" className="owner-login-form">
            <label htmlFor="crm-password">Owner password</label>
            <input
              id="crm-password"
              name="password"
              type="password"
              required
              minLength={20}
              maxLength={1024}
              autoComplete="current-password"
              aria-invalid={invalid || undefined}
              aria-describedby={error ? "owner-login-error" : undefined}
            />
            <button type="submit">
              Sign in with password
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M5 12h14m-5-5 5 5-5 5" />
              </svg>
            </button>
          </form>}
          {!configured && <div className="owner-login-setup">
            <p>In your Vercel project, add these environment variables for <strong>Production</strong>:</p>
            <dl>
              <dt><code>CRM_OWNER_EMAIL</code></dt>
              <dd>Your owner email address for secure email sign-in.</dd>
              <dt><code>CRM_PUBLIC_URL</code></dt>
              <dd>The public site address, such as https://oliphantremoval.com.</dd>
              <dt><code>CRM_SESSION_SECRET</code></dt>
              <dd>A private, random value of at least 32 characters.</dd>
            </dl>
            <p>Or use the existing password sign-in option:</p>
            <dl>
              <dt><code>CRM_OWNER_PASSWORD</code></dt>
              <dd>Your private password, at least 20 characters.</dd>
            </dl>
            <p>Save the settings and redeploy, then return here. Settings saved in Codex do not automatically transfer to Vercel.</p>
            <a href="https://vercel.com/dashboard" className="owner-login-setup-link">Open Vercel dashboard</a>
            <p className="owner-login-setup-note">Keep these values private. There is no default password.</p>
          </div>}

          {configured && emailEnabled && <p className="owner-login-access">For owners and invited team members.</p>}
        </div>

        <div className="owner-login-footer">
          <Link href="/">Back to website</Link>
          <span>Oliphant Removal</span>
        </div>
      </section>
    </main>
  );
}
