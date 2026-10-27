# Oliphant Removal CRM

The first custom CRM is at `/crm`, alongside the public website at `/`. It manages customers, leads, estimates, scheduled jobs, and follow-up tasks for tree, junk, snow, and storm cleanup work.

## Start locally

Use Node.js 24 and install the locked dependencies:

```sh
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
npm run dev -- --hostname 0.0.0.0
```

The dashboard starts with clearly labeled fictional sample records. Choose **Start empty** to clear them before entering your own records.

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

This version has no account login, shared database, team sync, automatic notifications, invoice delivery, or payment processing. Anyone using the same browser profile can access its local workspace. Shared team use needs server storage and access controls in a later implementation.

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
node --test tests/crm-model.test.mjs
npm run build
```

The model tests use Node.js 24's built-in TypeScript support and require no test dependencies. They cover backup roundtrips, decimal estimates, malformed imports, linked-customer integrity, duplicate IDs, date validation, and unknown-field removal.
