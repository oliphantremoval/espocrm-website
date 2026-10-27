import Image from "next/image";
import Link from "next/link";
import "./login.css";

type OwnerLoginFormProps = {
  configured?: boolean;
  invalid?: boolean;
  limited?: boolean;
};

export default function OwnerLoginForm({
  configured = true,
  invalid = false,
  limited = false,
}: OwnerLoginFormProps) {
  const error = limited
    ? "Too many sign-in attempts. Please wait, then try again."
    : invalid
      ? "That password was not recognized. Please try again."
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
          <h1 id="owner-login-title">{configured ? "Owner sign-in" : "Owner access is locked"}</h1>
          <p className="owner-login-intro">
            {configured
              ? "Enter your owner password to access your workspace."
              : "This deployment needs its owner-login settings before sign-in is available."}
          </p>

          {configured ? <form action="/crm/auth/login" method="post" className="owner-login-form">
            {error && (
              <p id="owner-login-error" className="owner-login-error" role="alert" aria-live="polite">
                {error}
              </p>
            )}
            <label htmlFor="crm-password">Password</label>
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
              Sign in
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M5 12h14m-5-5 5 5-5 5" />
              </svg>
            </button>
          </form> : <div className="owner-login-setup">
            <p>In your Vercel project, add these environment variables for <strong>Production</strong>:</p>
            <dl>
              <dt><code>CRM_OWNER_PASSWORD</code></dt>
              <dd>Your private password, at least 20 characters.</dd>
              <dt><code>CRM_SESSION_SECRET</code></dt>
              <dd>A separate secret, at least 32 random characters.</dd>
            </dl>
            <p>Save the settings and redeploy, then return here. Settings saved in Codex do not automatically transfer to Vercel.</p>
            <a href="https://vercel.com/dashboard" className="owner-login-setup-link">Open Vercel dashboard</a>
            <p className="owner-login-setup-note">Keep these values private. There is no default password.</p>
          </div>}

          <p className="owner-login-access">Owner access only.</p>
        </div>

        <div className="owner-login-footer">
          <Link href="/">Back to website</Link>
          <span>Oliphant Removal</span>
        </div>
      </section>
    </main>
  );
}
