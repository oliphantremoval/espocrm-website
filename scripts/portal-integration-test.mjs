import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { neon } from '@neondatabase/serverless';
import { createEmailSession } from '../lib/crm-auth-core.ts';

// Credentials enter through an echo-disabled terminal, never through argv or logs.
if (!process.stdin.isTTY) throw new Error('A secure interactive input is required.');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdout.write('Ready for private connection.\n');
const databaseUrl = await new Promise((resolve) => {
  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.includes('\n') || buffer.includes('\r')) resolve(buffer.split(/[\r\n]/, 1)[0]);
  });
});
process.stdin.setRawMode(false);
process.stdin.pause();

const sql = neon(databaseUrl);
const runId = randomUUID();
const emailA = `portal-test-a-${runId}@example.invalid`;
const emailB = `portal-test-b-${runId}@example.invalid`;
const changedEmail = `portal-test-new-${runId}@example.invalid`;
const ownerEmail = 'portal-owner-test@example.invalid';
const ownerSecret = randomBytes(48).toString('base64url');
const ownerCookie = `oliphant-crm-session=${createEmailSession({ ownerEmail, sessionSecret: ownerSecret })}`;
const inbox = [];
let smtp;
let app;
let failure;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function createMailbox() {
  return createServer((socket) => {
    let pending = '';
    let inData = false;
    let message = '';
    let recipient = '';
    socket.setEncoding('utf8');
    socket.write('220 localhost portal test\r\n');
    socket.on('data', (chunk) => {
      pending += chunk;
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index).replace(/\r$/, '');
        pending = pending.slice(index + 1);
        if (inData) {
          if (line === '.') {
            inbox.push({ recipient, message });
            inData = false;
            socket.write('250 Message accepted\r\n');
          } else message += `${line}\n`;
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 localhost\r\n');
        else if (/^MAIL FROM:/i.test(line)) { message = ''; recipient = ''; socket.write('250 OK\r\n'); }
        else if (/^RCPT TO:/i.test(line)) { recipient = line; socket.write('250 OK\r\n'); }
        else if (/^DATA/i.test(line)) { inData = true; socket.write('354 End with dot\r\n'); }
        else if (/^QUIT/i.test(line)) { socket.end('221 Goodbye\r\n'); }
        else socket.write('250 OK\r\n');
      }
    });
  });
}

async function waitForMail(email, count) {
  for (let i = 0; i < 100; i++) {
    const matches = inbox.filter((item) => item.recipient.toLowerCase().includes(email));
    if (matches.length >= count) {
      const text = matches[count - 1].message.replace(/=\n/g, '').replace(/=3D/gi, '=');
      const token = text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
      assert.ok(token, 'The local mailbox received a valid one-use sign-in link.');
      return token;
    }
    await delay(100);
  }
  throw new Error('The local test mailbox did not receive a sign-in link.');
}

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

try {
  smtp = createMailbox();
  const smtpPort = await listen(smtp);
  const reservation = createServer();
  const port = await listen(reservation);
  await stopServer(reservation);
  const base = `http://localhost:${port}`;
  const cli = new URL('../node_modules/next/dist/bin/next', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
  app = spawn(process.execPath, [cli, 'dev', '--hostname', 'localhost', '--port', String(port)], {
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development', VERCEL_ENV: 'development', ORSTORAGE_DATABASE_URL: databaseUrl, CRM_OWNER_EMAIL: ownerEmail, CRM_SESSION_SECRET: ownerSecret, CRM_PUBLIC_URL: 'https://portal-test.example.invalid', SMTP_EMAIL: 'sender@example.invalid', SMTP_PASSWORD: 'test-only', PORTAL_TEST_SMTP_PORT: String(smtpPort) },
  });
  let serverOutput = '';
  for (const stream of [app.stdout, app.stderr]) stream.on('data', (chunk) => { serverOutput = (serverOutput + chunk.toString()).slice(-12000); });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (app.exitCode !== null) throw new Error(`Local test server stopped (exit ${app.exitCode}).`);
    try { const response = await fetch(`${base}/portal/login`, { signal: AbortSignal.timeout(2000) }); if (response.ok) { ready = true; break; } } catch { /* Server is still starting. */ }
    await delay(1000);
  }
  if (!ready) throw new Error('Local test server did not start.');
  console.log('Local portal and private test mailbox are ready.');

  async function call(path, { method = 'GET', cookie, json, form, origin = base } = {}) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form !== undefined) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form); }
    return fetch(`${base}${path}`, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  }

  async function ownerCreate(email, name) {
    const res = await call('/api/crm/portal/customers', { method: 'POST', cookie: ownerCookie, json: { name, email, phone: '', address: '' } });
    assert.equal(res.status, 201, 'Owner can create a customer.');
    const body = await res.json();
    assert.equal(body.customer.enabled, false);
    return body.customer;
  }
  async function access(customer, enabled) {
    const res = await call(`/api/crm/portal/customers/${customer.id}`, { method: 'PATCH', cookie: ownerCookie, json: { enabled } });
    assert.equal(res.status, 200, 'Owner can change access.');
  }
  async function share(customer, title) {
    const res = await call(`/api/crm/portal/customers/${customer.id}/jobs`, { method: 'POST', cookie: ownerCookie, json: { title, service: 'Tree removal', status: 'Scheduled', scheduledDate: '2026-12-03', scheduledTime: '09:00', description: 'Visible customer details' } });
    assert.equal(res.status, 201, 'Owner can share a job.');
    return (await res.json()).job;
  }
  async function requestLink(email, count) {
    const res = await call('/api/portal/auth/request-link', { method: 'POST', form: { email } });
    assert.equal(res.status, 303, 'Sign-in request returns a generic response.');
    assert.match(res.headers.get('location') ?? '', /sent=1/);
    return waitForMail(email, count);
  }
  async function verify(token) {
    const res = await call('/api/portal/auth/verify', { method: 'POST', form: { token } });
    assert.equal(res.status, 303);
    return { location: res.headers.get('location') ?? '', cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
  }

  assert.equal((await call('/api/crm/portal/customers')).status, 401, 'Owner endpoints reject signed-out users.');
  assert.equal((await call('/api/portal/me')).status, 401, 'Portal data requires a customer session.');
  assert.equal((await call('/api/crm/portal/customers', { method: 'POST', cookie: ownerCookie, origin: 'https://other.example', json: {} })).status, 403, 'Cross-origin writes are denied.');

  const a = await ownerCreate(emailA, 'Portal test A');
  const b = await ownerCreate(emailB, 'Portal test B');
  await access(a, true);
  await access(b, true);
  const jobA = await share(a, 'Private project A');
  await share(b, 'Private project B');

  const tokenA = await requestLink(emailA, 1);
  const confirmation = await call(`/api/portal/auth/verify?token=${tokenA}`);
  assert.equal(confirmation.status, 200, 'Opening a link requires explicit confirmation.');
  const first = await verify(tokenA);
  assert.ok(first.location.endsWith('/portal') && first.cookie.startsWith('oliphant-customer='), 'Customer sign-in creates a session.');
  const replay = await verify(tokenA);
  assert.match(replay.location, /error=link/, 'A sign-in link is one-use.');

  const tokenB = await requestLink(emailB, 1);
  const simultaneous = await Promise.all([verify(tokenB), verify(tokenB)]);
  assert.equal(simultaneous.filter((item) => item.location.endsWith('/portal')).length, 1, 'Simultaneous reuse succeeds at most once.');
  const sessionB = simultaneous.find((item) => item.location.endsWith('/portal')).cookie;
  const accountA = await call('/api/portal/me', { cookie: first.cookie });
  assert.equal(accountA.status, 200);
  const dataA = await accountA.json();
  assert.equal(dataA.customer.email, emailA);
  assert.deepEqual(dataA.jobs.map((job) => job.title), ['Private project A'], 'Customer A cannot see customer B jobs.');
  const dataB = await (await call('/api/portal/me', { cookie: sessionB })).json();
  assert.equal(dataB.customer.email, emailB);
  assert.deepEqual(dataB.jobs.map((job) => job.title), ['Private project B'], 'Customer B cannot see customer A jobs.');
  assert.equal((await call(`/api/crm/portal/customers/${a.id}/jobs`, { cookie: sessionB })).status, 401, 'A customer cannot use owner endpoints.');

  const updated = await call(`/api/crm/portal/customers/${a.id}/jobs/${jobA.id}`, { method: 'PATCH', cookie: ownerCookie, json: { title: 'Updated project A', service: 'Tree removal', status: 'In progress', scheduledDate: '2026-12-03', scheduledTime: '10:00', description: 'Updated customer details' } });
  assert.equal(updated.status, 200, 'Owner can update a shared job.');
  assert.equal((await (await call('/api/portal/me', { cookie: first.cookie })).json()).jobs[0].title, 'Updated project A');
  assert.equal((await call(`/api/crm/portal/customers/${b.id}/jobs/${jobA.id}`, { method: 'DELETE', cookie: ownerCookie })).status, 404, 'A job cannot be removed through another customer record.');

  const stale = await requestLink(emailA, 2);
  await access(a, false);
  assert.equal((await call('/api/portal/me', { cookie: first.cookie })).status, 401, 'Disabling access revokes an active session.');
  await access(a, true);
  assert.equal((await call('/api/portal/me', { cookie: first.cookie })).status, 401, 'Re-enabling access does not revive an old session.');
  assert.match((await verify(stale)).location, /error=link/, 'Re-enabling access does not revive an old sign-in link.');
  assert.equal((await call('/api/portal/me', { cookie: sessionB })).status, 200, 'Revoking A does not affect B.');

  const racingToken = await requestLink(emailA, 3);
  const [racingSession] = await Promise.all([verify(racingToken), access(a, false)]);
  await access(a, true);
  if (racingSession.cookie.startsWith('oliphant-customer=')) assert.equal((await call('/api/portal/me', { cookie: racingSession.cookie })).status, 401, 'Concurrent revocation invalidates an in-flight session.');

  const tokenBeforeEmailChange = await requestLink(emailA, 4);
  const sessionBeforeEmailChange = await verify(tokenBeforeEmailChange);
  const changed = await call(`/api/crm/portal/customers/${a.id}`, { method: 'PATCH', cookie: ownerCookie, json: { profile: { name: 'Updated test customer', email: changedEmail, phone: '', address: '' } } });
  assert.equal(changed.status, 200, 'Owner can edit customer details.');
  assert.equal((await changed.json()).customer.enabled, false, 'Changing the sign-in email disables access.');
  assert.equal((await call('/api/portal/me', { cookie: sessionBeforeEmailChange.cookie })).status, 401, 'Changing email invalidates the old session.');
  await access(a, true);
  assert.equal((await call('/api/portal/me', { cookie: sessionBeforeEmailChange.cookie })).status, 401, 'The old session stays invalid after re-enabling access.');

  assert.equal((await call(`/api/crm/portal/customers/${a.id}/jobs/${jobA.id}`, { method: 'DELETE', cookie: ownerCookie })).status, 200, 'Owner can remove a shared job.');
  console.log('PASS: owner access, customer isolation, email-link sign-in, replay, revocation, concurrent access and shared-job controls.');
} catch (error) {
  failure = error instanceof Error ? error.message : 'Unknown integration-test failure.';
  console.error(`FAIL: ${failure}`);
} finally {
  if (app) app.kill();
  if (smtp) smtp.close();
  try {
    const ipKey = createHmac('sha256', ownerSecret).update('portal-rate-ip\0unknown').digest('hex');
    const localIpKey = createHmac('sha256', ownerSecret).update(`portal-rate-ip\0${'127.0.0.1'}`).digest('hex');
    const emailKeyA = createHmac('sha256', ownerSecret).update(`portal-rate-email\0${emailA}`).digest('hex');
    const emailKeyB = createHmac('sha256', ownerSecret).update(`portal-rate-email\0${emailB}`).digest('hex');
    await sql.transaction([
      sql`DELETE FROM portal_jobs WHERE customer_id IN (SELECT id FROM portal_customers WHERE email IN (${emailA}, ${emailB}, ${changedEmail}))`,
      sql`DELETE FROM portal_login_links WHERE customer_id IN (SELECT id FROM portal_customers WHERE email IN (${emailA}, ${emailB}, ${changedEmail}))`,
      sql`DELETE FROM portal_sessions WHERE customer_id IN (SELECT id FROM portal_customers WHERE email IN (${emailA}, ${emailB}, ${changedEmail}))`,
      sql`DELETE FROM portal_customers WHERE email IN (${emailA}, ${emailB}, ${changedEmail})`,
      sql`DELETE FROM portal_rate_limits WHERE key_hash IN (${ipKey}, ${localIpKey}, ${emailKeyA}, ${emailKeyB})`,
    ]);
    console.log('Test customer records removed.');
  } catch {
    console.error('Test cleanup failed; the fictional test records may remain.');
    failure = failure ?? 'Fixture cleanup failed.';
  }
  process.exit(failure ? 1 : 0);
}

