# Oliphant Removal CRM

The custom CRM is at `/crm`, alongside the public website at `/`. It manages customers, leads, estimates, scheduled jobs, and follow-up tasks for tree, junk, snow, and storm cleanup work.

Access requires an owner sign-in. Without a valid session, `/crm` redirects to `/crm/login`. If the server credentials are missing or invalid, that page displays **Owner access is locked** with setup guidance and no password form; the dashboard remains unavailable. There is no default password, public registration, or employee account creation. The public website has no workspace link.

## Configure owner access

Sign into [Vercel](https://vercel.com/) with the account that owns the website, select its existing project, and open **Settings → Environment Variables**. Add these values securely:

| Variable | Requirement |
| --- | --- |
| `CRM_OWNER_PASSWORD` | Your owner password: at least 20 characters and at most 1,024 characters. |
| `CRM_SESSION_SECRET` | A separate secret with at least 32 random characters and at most 1,024 characters. |

Set them for **Production**. Include **Preview** only if you also want owner access in updated preview deployments. Then redeploy the project so the new deployment receives the values. Missing or invalid settings keep access blocked; simply deploying this code does not create credentials.

Use **Visit** on the latest successful Production deployment, then append `/crm/login` to its address. An older deployment URL keeps its older code and settings. If the locked setup message persists, check the variable names, length requirements, Production scope, and whether the deployment was created after the settings were saved. Do not share their values when asking for help. Vercel may require its own account sign-in before the application page is visible.

Use a password manager to generate and retain both values. For the session secret, you can alternatively run this command on your own trusted machine:

```sh
openssl rand -hex 32
```

Do not put either value in chat, source files, Git commits, or a variable beginning with `NEXT_PUBLIC_`. This workspace cannot configure your Vercel secrets for you. To reset the owner password or rotate the session secret, change the corresponding value in Vercel and redeploy. Rotation invalidates existing sessions for subsequent requests.

When configured, visiting `/crm` without a valid session redirects to `/crm/login`. Sign-in is checked on the server for each workspace request. Successful sign-in sets a signed, two-hour `HttpOnly` cookie with `SameSite=Strict` and `Secure` in production. Login and logout accept same-origin POST requests. Login attempts have a best-effort per-process throttle; it is not a durable, shared rate limit across Vercel instances.

**Older deployments need separate attention.** Existing Vercel preview and deployment URLs keep their old build, including any earlier unrestricted CRM page. Protect or delete those deployments through Vercel; a new commit does not change them. Existing open tabs can also retain their loaded dashboard until refreshed or navigated away.

## Start locally

Use Node.js 24 and install the locked dependencies:

```sh
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm run dev -- --hostname 0.0.0.0
```

Provide both owner-access variables through your local process environment before starting the server. Do not commit their values. Without valid values, `/crm` redirects to the locked setup page at `/crm/login`, which has no sign-in form. Direct sign-in POST requests remain blocked with 404.

After signing in, the dashboard starts with clearly labeled fictional sample records. Choose **Start empty** to clear them before entering your own records.

## Daily workflow

1. Use **New job** to choose an existing customer or add a new one, then capture the request and property details.
2. Add an estimate and update the stage to **Estimate sent** when you have sent it yourself. Changing this status does not send a quote or email.
3. Set the appointment date, arrival time, and crew. Scheduled and in-progress jobs require a date.
4. In **Schedule**, start and complete jobs. Use **Tasks** for follow-up reminders.
5. Update contact and property details under **Customers**. A customer with linked jobs cannot be deleted until those jobs are removed.

Search matches job titles, customers, contact details, addresses, services, and crews. The overview totals reflect the records in this workspace. Completed job value is the estimate total before expenses; it does not record payments received.

## Storage and backups

Records are saved in this browser's local storage for this site address. They survive a normal page reload, but they are not shared with another browser, device, or site address. Clearing browser data or using a temporary browsing session can remove them. Open tabs for the same site receive updates, and conflicting writes are rejected so you can review the latest data.

Use **Export backup** regularly and before clearing the workspace. The JSON file contains customer contact details without encryption; store it privately. **Import backup** validates an exported file and asks before replacing the current workspace. Import replaces records rather than merging them. Files are limited to 5 MB.

Signing out removes the session cookie. It does not encrypt or clear browser-local records, and anyone using the same browser profile can access that stored data through the browser. Use a trusted browser profile for your owner workspace.

This version has owner sign-in but no shared database, separate employee accounts, team sync, automatic notifications, invoice delivery, or payment processing. Shared team use needs server storage and individual access controls in a later implementation.

## Existing website quote form

The public quote form continues to use the existing `/api/lead` endpoint. It is **not connected to the new browser-local CRM**. That endpoint uses EspoCRM and Gmail SMTP through these environment variables:

- `ESPOCRM_URL` and `ESPOCRM_API_KEY`
- `SMTP_EMAIL` and `SMTP_PASSWORD`
- `NOTIFICATION_EMAIL`

Keep credential values in secure environment settings. The existing endpoint catches integration failures and can still return success, so a successful submission response alone does not confirm lead delivery. CRM dashboard actions do not call that endpoint or send email.

## Checks

```sh
npm run lint
npx --no-install tsc --noEmit
node --test tests/*.test.mjs
npm run build
```

The tests use Node.js 24's built-in TypeScript support and require no test dependencies. Model tests cover backup roundtrips, decimal estimates, malformed imports, linked-customer integrity, duplicate IDs, date validation, and unknown-field removal. Authentication tests cover credential configuration, password verification, and session validation, tampering, and expiration.

After building, the cloud environment can also run `python3 tests/crm-access-smoke.py` using its installed Python Playwright and Chromium. It starts isolated local production servers with and without temporary test credentials, verifies HTML and RSC access controls, performs actual browser sign-in/sign-out including Back navigation, checks cookie/cache/CSRF behavior, and stops only its own servers. It does not configure real credentials or contact the live quote endpoint.
