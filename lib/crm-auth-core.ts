import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export type AuthConfig = {
  ownerPassword: string;
  sessionSecret: string;
};

export type EmailAuthConfig = {
  ownerEmail: string;
  sessionSecret: string;
};

export const SESSION_MAX_AGE_SECONDS = 7_200;
export const OWNER_LOGIN_LINK_MAX_AGE_SECONDS = 900;

const MAX_SECRET_LENGTH = 1_024;
const MAX_EMAIL_LENGTH = 254;
const MAX_TOKEN_LENGTH = 2_048;
const PASSWORD_SALT_CONTEXT = 'oliphant-removal/crm/password-salt/v1';
const SESSION_KEY_CONTEXT = 'oliphant-removal/crm/session-key/v1\0';
const EMAIL_SESSION_KEY_CONTEXT = 'oliphant-removal/crm/email-session-key/v1\0';
const EMAIL_LINK_KEY_CONTEXT = 'oliphant-removal/crm/email-link-key/v1\0';

function validSecret(value: unknown, minimumLength: number): value is string {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.length <= MAX_SECRET_LENGTH
    && value.trim().length > 0;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function validConfig(config: AuthConfig): boolean {
  return validSecret(config?.ownerPassword, 20) && validSecret(config?.sessionSecret, 32);
}

function validEmailConfig(config: EmailAuthConfig): boolean {
  return normalizeEmail(config?.ownerEmail) !== null && validSecret(config?.sessionSecret, 32);
}

/** Values remain server-side; callers must deny access when configuration is absent. */
export function getAuthConfig(env: Record<string, string | undefined>): AuthConfig | null {
  const ownerPassword = env.CRM_OWNER_PASSWORD;
  const sessionSecret = env.CRM_SESSION_SECRET;
  if (!validSecret(ownerPassword, 20) || !validSecret(sessionSecret, 32)) return null;
  return { ownerPassword, sessionSecret };
}

/** Email mode is intended for the one owner address configured on the server. */
export function getEmailAuthConfig(env: Record<string, string | undefined>): EmailAuthConfig | null {
  const ownerEmail = normalizeEmail(env.CRM_OWNER_EMAIL);
  const sessionSecret = env.CRM_SESSION_SECRET;
  if (!ownerEmail || !validSecret(sessionSecret, 32)) return null;
  return { ownerEmail, sessionSecret };
}

function passwordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1_024 * 1_024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function verifyOwnerPassword(candidate: string, config: AuthConfig): Promise<boolean> {
  if (!validConfig(config) || typeof candidate !== 'string' || candidate.length === 0 || candidate.length > MAX_SECRET_LENGTH) return false;
  const salt = createHmac('sha256', config.sessionSecret).update(PASSWORD_SALT_CONTEXT).digest();
  const [candidateKey, expectedKey] = await Promise.all([
    passwordKey(candidate, salt),
    passwordKey(config.ownerPassword, salt),
  ]);
  return timingSafeEqual(candidateKey, expectedKey);
}

function passwordSessionKey(config: AuthConfig): Buffer {
  // Binding the key to both credentials immediately invalidates sessions on either rotation.
  return createHmac('sha256', config.sessionSecret)
    .update(SESSION_KEY_CONTEXT)
    .update(config.ownerPassword)
    .digest();
}

function emailSessionKey(config: EmailAuthConfig): Buffer {
  return createHmac('sha256', config.sessionSecret)
    .update(EMAIL_SESSION_KEY_CONTEXT)
    .update(config.ownerEmail)
    .digest();
}

function emailLinkKey(config: EmailAuthConfig): Buffer {
  return createHmac('sha256', config.sessionSecret)
    .update(EMAIL_LINK_KEY_CONTEXT)
    .update(config.ownerEmail)
    .digest();
}

function validNow(nowSeconds: number, lifetimeSeconds: number): boolean {
  return Number.isSafeInteger(nowSeconds)
    && nowSeconds >= 0
    && nowSeconds <= Number.MAX_SAFE_INTEGER - lifetimeSeconds;
}

function decodeCanonical(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.toString('base64url') === value ? decoded : null;
}

function signPayload(payload: object, key: Buffer): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', key).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifiedPayload(token: string | undefined, key: Buffer): Record<string, unknown> | null {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const decodedPayload = decodeCanonical(encoded);
  const decodedSignature = decodeCanonical(signature);
  if (!decodedPayload || !decodedSignature || decodedSignature.length !== 32) return null;
  const expectedSignature = createHmac('sha256', key).update(encoded).digest();
  if (!timingSafeEqual(decodedSignature, expectedSignature)) return null;

  let value: unknown;
  try {
    value = JSON.parse(decodedPayload.toString('utf8'));
  } catch {
    return null;
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

type SessionPayload = {
  version: 1;
  owner: 'owner';
  iat: number;
  exp: number;
  nonce: string;
};

function createSessionPayload(nowSeconds: number): SessionPayload {
  return {
    version: 1,
    owner: 'owner',
    iat: nowSeconds,
    exp: nowSeconds + SESSION_MAX_AGE_SECONDS,
    nonce: randomBytes(24).toString('base64url'),
  };
}

function validSessionPayload(payload: Record<string, unknown>, nowSeconds: number): boolean {
  if (Object.keys(payload).sort().join(',') !== 'exp,iat,nonce,owner,version') return false;
  if (payload.version !== 1 || payload.owner !== 'owner') return false;
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return false;
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat < 0) return false;
  if (payload.iat > nowSeconds || payload.exp <= nowSeconds || payload.exp - payload.iat !== SESSION_MAX_AGE_SECONDS) return false;
  if (typeof payload.nonce !== 'string') return false;
  const nonce = decodeCanonical(payload.nonce);
  return nonce !== null && nonce.length === 24;
}

export function createSession(config: AuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): string {
  if (!validConfig(config)) throw new Error('Owner login is not configured.');
  if (!validNow(nowSeconds, SESSION_MAX_AGE_SECONDS)) throw new Error('Cannot create a session with an invalid issue time.');
  return signPayload(createSessionPayload(nowSeconds), passwordSessionKey(config));
}

export function verifySession(token: string | undefined, config: AuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): boolean {
  if (!validConfig(config) || !validNow(nowSeconds, SESSION_MAX_AGE_SECONDS)) return false;
  const payload = verifiedPayload(token, passwordSessionKey(config));
  return payload !== null && validSessionPayload(payload, nowSeconds);
}

export function createEmailSession(config: EmailAuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): string {
  if (!validEmailConfig(config)) throw new Error('Owner email login is not configured.');
  if (!validNow(nowSeconds, SESSION_MAX_AGE_SECONDS)) throw new Error('Cannot create a session with an invalid issue time.');
  return signPayload(createSessionPayload(nowSeconds), emailSessionKey(config));
}

export function verifyEmailSession(token: string | undefined, config: EmailAuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): boolean {
  if (!validEmailConfig(config) || !validNow(nowSeconds, SESSION_MAX_AGE_SECONDS)) return false;
  const payload = verifiedPayload(token, emailSessionKey(config));
  return payload !== null && validSessionPayload(payload, nowSeconds);
}

type OwnerLoginLinkPayload = {
  version: 1;
  purpose: 'owner-login';
  iat: number;
  exp: number;
  nonce: string;
};

function validOwnerLoginLinkPayload(payload: Record<string, unknown>, nowSeconds: number): boolean {
  if (Object.keys(payload).sort().join(',') !== 'exp,iat,nonce,purpose,version') return false;
  if (payload.version !== 1 || payload.purpose !== 'owner-login') return false;
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return false;
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat < 0) return false;
  if (payload.iat > nowSeconds || payload.exp <= nowSeconds || payload.exp - payload.iat !== OWNER_LOGIN_LINK_MAX_AGE_SECONDS) return false;
  if (typeof payload.nonce !== 'string') return false;
  const nonce = decodeCanonical(payload.nonce);
  return nonce !== null && nonce.length === 24;
}

export function createOwnerLoginLink(config: EmailAuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): string {
  if (!validEmailConfig(config)) throw new Error('Owner email login is not configured.');
  if (!validNow(nowSeconds, OWNER_LOGIN_LINK_MAX_AGE_SECONDS)) throw new Error('Cannot create a login link with an invalid issue time.');
  const payload: OwnerLoginLinkPayload = {
    version: 1,
    purpose: 'owner-login',
    iat: nowSeconds,
    exp: nowSeconds + OWNER_LOGIN_LINK_MAX_AGE_SECONDS,
    nonce: randomBytes(24).toString('base64url'),
  };
  return signPayload(payload, emailLinkKey(config));
}

export function verifyOwnerLoginLink(token: string | undefined, config: EmailAuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): boolean {
  if (!validEmailConfig(config) || !validNow(nowSeconds, OWNER_LOGIN_LINK_MAX_AGE_SECONDS)) return false;
  const payload = verifiedPayload(token, emailLinkKey(config));
  return payload !== null && validOwnerLoginLinkPayload(payload, nowSeconds);
}

