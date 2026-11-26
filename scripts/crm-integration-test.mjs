import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEmailSession } from '../lib/crm-auth-core.ts';
import { createEmptyState } from '../app/crm/model.ts';

// Use a temporary PostgreSQL database in-process. Install @electric-sql/pglite
// locally or pass its entry point as the first argument. No cloud URL is read.
const engine = process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite';
const { PGlite } = await import(engine);
const database = new PGlite();
const inbox = [];
const ownerEmail = 'crm-owner@example.invalid';
const coOwnerEmail = 'crm-co-owner@example.invalid';
const managerEmail = 'crm-manager@example.invalid';
const ownerSecret = randomBytes(48).toString('base64url');
const ownerCookie = 'oliphant-crm-session=' + createEmailSession({ ownerEmail, sessionSecret: ownerSecret });
const databaseUrl = 'postgresql://local:local@ep-crm-test.crm-test.invalid/crm_test';
const publicHost = 'https://oliphant-crm-test.example.invalid';
const servers = [];
let app;
let serverOutput = '';

async function listen(server, hostname = '127.0.0.1') {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, hostname, resolve);
  });
  servers.push(server);
  return server.address().port;
}

function createMailbox() {
  return createServer((socket) => {
    let pending = '';
    let recipient = '';
    let message = null;
    socket.setEncoding('utf8');
    socket.write('220 localhost CRM test\r\n');
    socket.on('data', (chunk) => {
      pending += chunk;
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index).replace(/\r$/, '');
        pending = pending.slice(index + 1);
        if (message !== null) {
          if (line === '.') {
            inbox.push({ recipient, text: message.replace(/=\n/g, '').replace(/=3D/gi, '=') });
            message = null;
            socket.write('250 Accepted\r\n');
          } else message += line + '\n';
        } else if (/^RCPT TO:/i.test(line)) {
          recipient = line;
          socket.write('250 OK\r\n');
        } else if (/^DATA/i.test(line)) {
          message = '';
          socket.write('354 End with dot\r\n');
        } else if (/^QUIT/i.test(line)) socket.end('221 Goodbye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
}

function createSqlBridge() {
  // Give the app's Neon driver the same HTTP result shape it uses in production.
  const asText = Object.fromEntries([16, 20, 21, 23, 26, 114, 700, 701, 1082, 1114, 1184, 1700, 2950, 3802].map((oid) => [oid, String]));
  return createHttpServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    try {
      const connection = new URL(request.headers['neon-connection-string']);
      assert.equal(connection.host, new URL(databaseUrl).host);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const { query, params } = JSON.parse(Buffer.concat(chunks).toString());
      const result = await database.query(query, params, { rowMode: 'array', parsers: asText });
      response.end(JSON.stringify(result));
    } catch (error) {
      console.error('Local SQL bridge:', error.message);
      response.statusCode = 400;
      response.end(JSON.stringify({ message: error.message, code: error.code }));
    }
  });
}

async function waitForMail(email, pattern, index = 0) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const matches = inbox.filter((item) => item.recipient.includes(email) && pattern.test(item.text));
    if (matches.length > index) return matches[index].text.match(pattern);
    await delay(100);
  }
  throw new Error('Expected CRM email did not reach the loopback mailbox.');
}

try {
  for (const file of ['crm-team.sql', 'crm-workspace.sql', 'customer-portal.sql']) {
    await database.exec(await readFile(new URL('../docs/sql/' + file, import.meta.url), 'utf8'));
  }
  const sqlPort = await listen(createSqlBridge());
  const smtpPort = await listen(createMailbox());
  const portReservation = createServer();
  const port = await listen(portReservation, 'localhost');
  await new Promise((resolve) => portReservation.close(resolve));
  servers.pop();

  const base = 'http://localhost:' + port;
  const cli = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
  const preload = [
    'const fetchBefore = globalThis.fetch;',
    'globalThis.fetch = (input, init) => fetchBefore(',
    'String(input) === "https://api.crm-test.invalid/sql" ? "http://127.0.0.1:' + sqlPort + '/sql" : input, init);',
  ].join('');
  const nodeOptions = '--import=data:text/javascript,' + encodeURIComponent(preload);
  app = spawn(process.execPath, [cli, 'dev', '--hostname', 'localhost', '--port', String(port)], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      NODE_ENV: 'development',
      VERCEL_ENV: 'development',
      ORSTORAGE_DATABASE_URL: databaseUrl,
      DATABASE_URL: databaseUrl,
      CRM_OWNER_EMAIL: ownerEmail,
      CRM_SESSION_SECRET: ownerSecret,
      CRM_PUBLIC_URL: publicHost,
      SMTP_EMAIL: 'sender@example.invalid',
      SMTP_PASSWORD: 'test-only',
      PORTAL_TEST_SMTP_PORT: String(smtpPort),
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
  for (const stream of [app.stdout, app.stderr]) {
    stream.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-12000); });
  }

  function call(path, { method = 'GET', cookie, json, form, origin = base } = {}) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    if (form !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form);
    }
    return fetch(base + path, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  }

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (app.exitCode !== null) throw new Error('Local CRM server exited.');
    try {
      if ((await call('/crm/login')).ok) {
        ready = true;
        break;
      }
    } catch { /* Server is still starting. */ }
    await delay(500);
  }
  assert.ok(ready, 'Local CRM server is ready.');

  async function expectStatus(path, status, options) {
    const response = await call(path, options);
    assert.equal(response.status, status, (options?.method ?? 'GET') + ' ' + path);
    return response;
  }

  const teamPath = '/api/crm/team';
  const teamVerifyPath = '/crm/auth/team-verify';
  const workspacePath = '/api/crm/workspace';
  const newMember = (email, role) => ({ name: role === 'manager' ? 'Test Manager' : 'Test Co-owner', email, role });
  async function addMember(cookie, email, role, status = 201) {
    return (await (await expectStatus(teamPath, status, { method: 'POST', cookie, json: newMember(email, role) })).json()).member;
  }
  async function requestToken(email, index = 0) {
    const request = await expectStatus('/crm/auth/request-link', 303, { method: 'POST', form: { email } });
    assert.match(request.headers.get('location') ?? '', /[?&]sent=1/);
    const match = await waitForMail(email, /\/crm\/auth\/team-verify\?token=([A-Za-z0-9_-]{43})/, index);
    return match[1];
  }
  async function verify(token) {
    const result = await expectStatus(teamVerifyPath, 303, { method: 'POST', form: { token } });
    return { location: result.headers.get('location') ?? '', cookie: (result.headers.get('set-cookie') ?? '').split(';')[0] };
  }
  async function getWorkspace(cookie) {
    const result = await expectStatus(workspacePath, 200, { cookie });
    assert.match(result.headers.get('cache-control') ?? '', /no-store/);
    return result.json();
  }
  function putWorkspace(cookie, state, revision) {
    return call(workspacePath, { method: 'PUT', cookie, json: { state, revision } });
  }

  await expectStatus(teamPath, 401);
  await expectStatus(workspacePath, 401);
  await expectStatus(workspacePath, 403, { method: 'PUT', cookie: ownerCookie, json: {}, origin: publicHost });
  assert.deepEqual(await getWorkspace(ownerCookie), { state: null, revision: null });
  await addMember(ownerCookie, ownerEmail, 'co-owner', 409);
  const coOwner = await addMember(ownerCookie, coOwnerEmail, 'co-owner');
  await addMember(ownerCookie, coOwnerEmail, 'manager', 409);
  await expectStatus(teamPath + '/' + coOwner.id + '/invite', 200, { method: 'POST', cookie: ownerCookie });
  await waitForMail(coOwnerEmail, /\/crm\/login/);
  const coOwnerToken = await requestToken(coOwnerEmail);
  const confirmation = await call(teamVerifyPath + '?token=' + coOwnerToken);
  assert.equal(confirmation.status, 200, 'An opened sign-in link waits for confirmation.');
  const coOwnerSession = await verify(coOwnerToken);
  assert.match(coOwnerSession.location, /\/crm$/);
  assert.match(coOwnerSession.cookie, /^oliphant-crm-team=/);
  assert.match((await verify(coOwnerToken)).location, /error=link/, 'A sign-in link is one-use.');

  const manager = await addMember(coOwnerSession.cookie, managerEmail, 'manager');
  await addMember(coOwnerSession.cookie, 'forbidden@example.invalid', 'co-owner', 403);
  const coOwnerTeam = await (await expectStatus(teamPath, 200, { cookie: coOwnerSession.cookie })).json();
  assert.deepEqual(coOwnerTeam.members.map((member) => member.id), [manager.id]);
  const managerToken = await requestToken(managerEmail);
  const managerSession = await verify(managerToken);
  assert.match(managerSession.location, /\/crm$/);
  const managerOptions = { cookie: managerSession.cookie };
  await expectStatus(teamPath, 403, managerOptions);
  await expectStatus('/api/crm/website', 403, { ...managerOptions, method: 'PUT', json: {} });
  await expectStatus('/api/crm/portal/customers', 200, managerOptions);
  assert.deepEqual(await getWorkspace(managerSession.cookie), { state: null, revision: null });
  assert.equal((await putWorkspace(managerSession.cookie, createEmptyState(), null)).status, 403);
  assert.equal((await putWorkspace(ownerCookie, { ...createEmptyState(), demo: true }, null)).status, 400);

  const initial = createEmptyState();
  initial.settings.profile.ownerName = 'Primary Test Profile';
  initial.settings.business.name = 'Test Business';
  initial.settings.estimateDefaults.terms = 'Owner-only terms';
  initial.customers.push({ id: 'test-customer', name: 'Test Customer', email: '', phone: '', address: '', notes: '' });
  const activated = await putWorkspace(ownerCookie, initial, null);
  assert.equal(activated.status, 200, 'The primary owner activates a shared workspace.');
  assert.equal((await activated.json()).revision, 1);
  assert.equal((await putWorkspace(ownerCookie, initial, null)).status, 409, 'A second activation cannot replace data.');
  const managerSnapshot = await getWorkspace(managerSession.cookie);
  assert.equal(managerSnapshot.state.settings.profile.contactEmail, managerEmail);
  assert.equal(managerSnapshot.state.settings.business.name, 'Test Business');
  assert.notEqual(managerSnapshot.state.settings.estimateDefaults.terms, 'Owner-only terms');
  assert.equal(managerSnapshot.state.customers[0].name, 'Test Customer');

  const alternate = structuredClone(managerSnapshot.state);
  managerSnapshot.state.settings.business.name = 'Forbidden manager change';
  managerSnapshot.state.tasks.push({ id: 'manager-task', title: 'Manager edit', dueDate: '', done: false });
  alternate.tasks.push({ id: 'other-task', title: 'Concurrent edit', dueDate: '', done: false });
  const results = await Promise.all([
    putWorkspace(managerSession.cookie, managerSnapshot.state, managerSnapshot.revision),
    putWorkspace(managerSession.cookie, alternate, managerSnapshot.revision),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409], 'Only one save can use a revision.');
  const ownerSnapshot = await getWorkspace(ownerCookie);
  assert.equal(ownerSnapshot.state.tasks.length, 1);
  assert.deepEqual(ownerSnapshot.state.settings, initial.settings);

  const coOwnerSnapshot = await getWorkspace(coOwnerSession.cookie);
  coOwnerSnapshot.state.settings.profile.ownerName = 'Forbidden co-owner profile change';
  coOwnerSnapshot.state.settings.business.name = 'Updated by co-owner';
  assert.equal((await putWorkspace(coOwnerSession.cookie, coOwnerSnapshot.state, coOwnerSnapshot.revision)).status, 200);
  const profile = (await getWorkspace(ownerCookie)).state.settings;
  assert.equal(profile.profile.ownerName, 'Primary Test Profile');
  assert.equal(profile.business.name, 'Updated by co-owner');

  await expectStatus(teamPath + '/' + manager.id, 200, { method: 'PATCH', cookie: ownerCookie, json: { enabled: false } });
  await expectStatus(workspacePath, 401, managerOptions);
  await expectStatus(teamPath + '/' + manager.id, 200, { method: 'PATCH', cookie: ownerCookie, json: { enabled: true } });
  await expectStatus(workspacePath, 401, managerOptions);
  assert.match((await verify(await requestToken(managerEmail, 1))).location, /\/crm$/);
  console.log('PASS: CRM invitations, one-use sign-in, role permissions, shared edits, revision conflicts, and session revocation.');

  const playwrightEntry = process.env.CRM_TEST_PLAYWRIGHT_ENTRY;
  const chrome = process.env.CRM_TEST_CHROME;
  if (playwrightEntry && chrome) {
    const { chromium } = await import(pathToFileURL(playwrightEntry).href);
    const browser = await chromium.launch({ executablePath: chrome, headless: true });
    try {
      const ownerContext = await browser.newContext();
      await ownerContext.addCookies([{ name: 'oliphant-crm-session', value: ownerCookie.split('=')[1], url: base }]);
      const ownerPage = await ownerContext.newPage();
      await ownerPage.goto(base + '/crm');
      await ownerPage.getByRole('navigation', { name: 'CRM navigation' }).getByRole('button', { name: 'Settings', exact: true }).click();
      await ownerPage.getByRole('tab', { name: 'Team', exact: true }).click();
      await ownerPage.getByRole('heading', { name: 'Team access' }).waitFor();
      await ownerPage.getByText(managerEmail, { exact: true }).waitFor();
      const browserInviteEmail = 'crm-browser-invite@example.invalid';
      const addForm = ownerPage.locator('form').filter({ has: ownerPage.getByRole('button', { name: 'Add team member' }) });
      await addForm.getByLabel('Full name').fill('Browser Test Co-owner');
      await addForm.getByLabel('Work email').fill(browserInviteEmail);
      await addForm.getByLabel('Role', { exact: true }).selectOption('co-owner');
      await addForm.getByRole('button', { name: 'Add team member' }).click();
      await ownerPage.getByText(browserInviteEmail, { exact: true }).waitFor();
      await ownerPage.getByRole('button', { name: 'Send invitation to Browser Test Co-owner' }).click();
      await waitForMail(browserInviteEmail, /\/crm\/login/);
      await ownerContext.close();

      const managerPage = await browser.newPage();
      const managerBrowserToken = await requestToken(managerEmail, 2);
      await managerPage.goto(base + teamVerifyPath + '?token=' + managerBrowserToken);
      await managerPage.getByRole('button', { name: 'Sign in to the CRM' }).click();
      await managerPage.waitForURL(base + '/crm');
      const managerNav = managerPage.getByRole('navigation', { name: 'CRM navigation' });
      await managerNav.getByRole('button', { name: 'Customers', exact: true }).click();
      await managerPage.getByText('Test Customer', { exact: true }).waitFor();
      assert.equal(await managerNav.getByRole('button', { name: 'Settings', exact: true }).count(), 0);
      console.log('PASS: create and invite a co-owner from Settings, native email confirmation, and manager workspace access in Chrome.');
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  console.error(error.message);
  console.error(serverOutput.replace(/token=[A-Za-z0-9_-]{43}/g, 'token=[redacted]'));
  process.exitCode = 1;
} finally {
  if (app) app.kill();
  for (const server of servers) {
    server.close();
    server.closeAllConnections?.();
  }
  await database.close();
}
