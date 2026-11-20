import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  createEmailSession,
  createOwnerLoginLink,
  createSession,
  getAuthConfig,
  getEmailAuthConfig,
  OWNER_LOGIN_LINK_MAX_AGE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  verifyEmailSession,
  verifyOwnerLoginLink,
  verifyOwnerPassword,
  verifySession,
} from '../lib/crm-auth-core.ts';

// Explicit, non-production fixtures. No environment credentials are read by these tests.
const config = {
  ownerPassword: 'test-only-owner-password-never-use-in-production',
  sessionSecret: 'test-only-session-secret-never-use-in-production-2026',
};
const emailConfig = {
  ownerEmail: 'oliphantremoval@gmail.com',
  sessionSecret: 'test-only-email-session-secret-never-use-in-production-2026',
};
const now = 1_800_000_000;

function signPayload(payload, activeConfig = config) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = createHmac('sha256', activeConfig.sessionSecret)
    .update('oliphant-removal/crm/session-key/v1\0')
    .update(activeConfig.ownerPassword)
    .digest();
  const signature = createHmac('sha256', key).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function payload() {
  return JSON.parse(Buffer.from(createSession(config, now).split('.')[0], 'base64url').toString());
}

test('owner access is unconfigured unless both server credentials meet their requirements', () => {
  assert.equal(getAuthConfig({}), null);
  assert.equal(getAuthConfig({ CRM_OWNER_PASSWORD: config.ownerPassword }), null);
  assert.equal(getAuthConfig({ CRM_SESSION_SECRET: config.sessionSecret }), null);
  assert.equal(getAuthConfig({ CRM_OWNER_PASSWORD: 'x'.repeat(19), CRM_SESSION_SECRET: config.sessionSecret }), null);
  assert.equal(getAuthConfig({ CRM_OWNER_PASSWORD: config.ownerPassword, CRM_SESSION_SECRET: 'x'.repeat(31) }), null);
  assert.equal(getAuthConfig({ CRM_OWNER_PASSWORD: ' '.repeat(20), CRM_SESSION_SECRET: config.sessionSecret }), null);
  assert.equal(getAuthConfig({ CRM_OWNER_PASSWORD: config.ownerPassword, CRM_SESSION_SECRET: '\t'.repeat(32) }), null);
  assert.equal(getAuthConfig({ CRM_OWNER_PASSWORD: 'x'.repeat(1025), CRM_SESSION_SECRET: config.sessionSecret }), null);
  assert.equal(getAuthConfig({ CRM_OWNER_PASSWORD: config.ownerPassword, CRM_SESSION_SECRET: 'x'.repeat(1025) }), null);
  assert.deepEqual(getAuthConfig({ CRM_OWNER_PASSWORD: config.ownerPassword, CRM_SESSION_SECRET: config.sessionSecret }), config);
});

test('password verification accepts only the exact configured password', async () => {
  assert.equal(await verifyOwnerPassword(config.ownerPassword, config), true);
  assert.equal(await verifyOwnerPassword('a different but sufficiently long password', config), false);
  assert.equal(await verifyOwnerPassword(config.ownerPassword.toUpperCase(), config), false);
  assert.equal(await verifyOwnerPassword(`${config.ownerPassword} `, config), false);
  assert.equal(await verifyOwnerPassword('', config), false);
  assert.equal(await verifyOwnerPassword('x'.repeat(1025), config), false);
  assert.equal(await verifyOwnerPassword(config.ownerPassword, { ...config, sessionSecret: '' }), false);
});

test('sessions are valid for exactly two hours and contain no credential values', () => {
  const token = createSession(config, now);
  const claims = payload();
  assert.equal(SESSION_MAX_AGE_SECONDS, 7200);
  assert.equal(verifySession(token, config, now), true);
  assert.equal(verifySession(token, config, now + SESSION_MAX_AGE_SECONDS - 1), true);
  assert.equal(verifySession(token, config, now + SESSION_MAX_AGE_SECONDS), false);
  assert.equal(verifySession(token, config, now - 1), false);
  assert.equal(claims.owner, 'owner');
  assert.equal(claims.exp - claims.iat, SESSION_MAX_AGE_SECONDS);
  assert.equal(Object.keys(claims).sort().join(','), 'exp,iat,nonce,owner,version');
  assert.ok(!JSON.stringify(claims).includes(config.ownerPassword));
  assert.ok(!JSON.stringify(claims).includes(config.sessionSecret));
  assert.notEqual(token, createSession(config, now), 'separate logins receive independent random nonces');
});

test('tampering with either token segment is rejected', () => {
  const token = createSession(config, now);
  const [encoded, signature] = token.split('.');
  const mutatedPayload = Buffer.from(JSON.stringify({ ...payload(), owner: 'someone-else' })).toString('base64url');
  assert.equal(verifySession(`${mutatedPayload}.${signature}`, config, now), false);
  assert.equal(verifySession(`${encoded}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`, config, now), false);
});

test('rotating either password or session secret invalidates all existing sessions', () => {
  const token = createSession(config, now);
  assert.equal(verifySession(token, { ...config, ownerPassword: 'a-new-owner-password-at-least-twenty-characters' }, now), false);
  assert.equal(verifySession(token, { ...config, sessionSecret: 'a-new-session-secret-at-least-thirty-two-characters' }, now), false);
  assert.equal(verifySession(token, { ...config, sessionSecret: '' }, now), false);
});

for (const malformed of [undefined, '', '.', 'not-a-session', 'a.b.c', 'a.b', 'x'.repeat(2049), ' . ', 'e30=.AA', 'e30.AA==']) {
  test(`malformed token ${malformed === undefined ? 'undefined' : JSON.stringify(malformed).slice(0, 45)} is denied`, () => {
    assert.equal(verifySession(malformed, config, now), false);
  });
}

test('equivalent but noncanonical base64url signatures are rejected', () => {
  const [encoded, signature] = createSession(config, now).split('.');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lastIndex = alphabet.indexOf(signature.at(-1));
  const noncanonical = signature.slice(0, -1) + alphabet[lastIndex + 1];
  assert.deepEqual(Buffer.from(noncanonical, 'base64url'), Buffer.from(signature, 'base64url'));
  assert.equal(verifySession(`${encoded}.${noncanonical}`, config, now), false);
  assert.equal(verifySession(`${encoded}=.${signature}`, config, now), false);
});

test('valid signatures do not excuse invalid session claims', () => {
  const original = payload();
  const invalid = [
    { ...original, version: 2 },
    { ...original, owner: 'guest' },
    { ...original, iat: String(now) },
    { ...original, exp: String(now + SESSION_MAX_AGE_SECONDS) },
    { ...original, iat: now + 1, exp: now + 1 + SESSION_MAX_AGE_SECONDS },
    { ...original, iat: now - 1, exp: now + SESSION_MAX_AGE_SECONDS },
    { ...original, iat: now - SESSION_MAX_AGE_SECONDS, exp: now },
    { ...original, iat: now + 0.5 },
    { ...original, exp: Number.MAX_SAFE_INTEGER + 1 },
    { ...original, iat: -1, exp: SESSION_MAX_AGE_SECONDS - 1 },
    { ...original, nonce: '' },
    { ...original, nonce: 'x'.repeat(33) },
    { ...original, nonce: null },
    { ...original, additionalPermission: 'admin' },
    { ...original, ownerPassword: config.ownerPassword },
    [],
    null,
    true,
  ];
  for (const invalidPayload of invalid) assert.equal(verifySession(signPayload(invalidPayload), config, now), false);
});

test('invalid configuration and issue times cannot create authenticated sessions', () => {
  assert.throws(() => createSession({ ...config, ownerPassword: '' }, now), /not configured/);
  for (const invalidTime of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => createSession(config, invalidTime), /invalid issue time/);
    assert.equal(verifySession(createSession(config, now), config, invalidTime), false);
  }
});

test('email owner configuration requires a valid email and a separate session secret', () => {
  assert.equal(getEmailAuthConfig({}), null);
  assert.equal(getEmailAuthConfig({ CRM_OWNER_EMAIL: emailConfig.ownerEmail }), null);
  assert.equal(getEmailAuthConfig({ CRM_OWNER_EMAIL: 'not-an-email', CRM_SESSION_SECRET: emailConfig.sessionSecret }), null);
  assert.equal(getEmailAuthConfig({ CRM_OWNER_EMAIL: 'a'.repeat(250) + '@x.com', CRM_SESSION_SECRET: emailConfig.sessionSecret }), null);
  assert.deepEqual(
    getEmailAuthConfig({ CRM_OWNER_EMAIL: '  OLIPHANTREMOVAL@GMAIL.COM  ', CRM_SESSION_SECRET: emailConfig.sessionSecret }),
    emailConfig,
  );
});

test('email sessions and owner sign-in links are short-lived, signed, and mutually isolated from password sessions', () => {
  const emailSession = createEmailSession(emailConfig, now);
  const loginLink = createOwnerLoginLink(emailConfig, now);
  const passwordSession = createSession(config, now);
  const linkClaims = JSON.parse(Buffer.from(loginLink.split('.')[0], 'base64url').toString());

  assert.equal(OWNER_LOGIN_LINK_MAX_AGE_SECONDS, 900);
  assert.equal(verifyEmailSession(emailSession, emailConfig, now), true);
  assert.equal(verifyEmailSession(emailSession, emailConfig, now + SESSION_MAX_AGE_SECONDS), false);
  assert.equal(verifyOwnerLoginLink(loginLink, emailConfig, now), true);
  assert.equal(verifyOwnerLoginLink(loginLink, emailConfig, now + OWNER_LOGIN_LINK_MAX_AGE_SECONDS), false);
  assert.equal(verifyOwnerLoginLink(loginLink.slice(0, -1) + (loginLink.at(-1) === 'A' ? 'B' : 'A'), emailConfig, now), false);
  assert.equal(verifyEmailSession(passwordSession, emailConfig, now), false);
  assert.equal(verifySession(emailSession, config, now), false);
  assert.equal(verifyOwnerLoginLink(loginLink, { ...emailConfig, ownerEmail: 'new-owner@example.com' }, now), false);
  assert.equal(verifyOwnerLoginLink(loginLink, { ...emailConfig, sessionSecret: 'rotated-email-session-secret-never-use-in-production-2026' }, now), false);
  assert.deepEqual(Object.keys(linkClaims).sort(), ['exp', 'iat', 'nonce', 'purpose', 'version']);
  assert.ok(!JSON.stringify(linkClaims).includes(emailConfig.ownerEmail));
  assert.ok(!JSON.stringify(linkClaims).includes(emailConfig.sessionSecret));
});

