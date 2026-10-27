import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export type AuthConfig = {
  ownerPassword: string;
  sessionSecret: string;
};

export const SESSION_MAX_AGE_SECONDS = 7_200;
const MAX_SECRET_LENGTH = 1_024;
const MAX_TOKEN_LENGTH = 2_048;
const PASSWORD_SALT_CONTEXT = 'oliphant-removal/crm/password-salt/v1';
const SESSION_KEY_CONTEXT = 'oliphant-removal/crm/session-key/v1\0';

function validSecret(value: unknown, minimumLength: number): value is string {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.length <= MAX_SECRET_LENGTH
    && value.trim().length > 0;
}

function validConfig(config: AuthConfig): boolean {
  return validSecret(config?.ownerPassword, 20) && validSecret(config?.sessionSecret, 32);
}

/** Values remain server-side; callers must deny access when configuration is absent. */
export function getAuthConfig(env: Record<string, string | undefined>): AuthConfig | null {
  const ownerPassword = env.CRM_OWNER_PASSWORD;
  const sessionSecret = env.CRM_SESSION_SECRET;
  if (!validSecret(ownerPassword, 20) || !validSecret(sessionSecret, 32)) return null;
  return { ownerPassword, sessionSecret };
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

function sessionKey(config: AuthConfig): Buffer {
  // Binding the key to both credentials immediately invalidates sessions on either rotation.
  return createHmac('sha256', config.sessionSecret)
    .update(SESSION_KEY_CONTEXT)
    .update(config.ownerPassword)
    .digest();
}

function validNow(nowSeconds: number): boolean {
  return Number.isSafeInteger(nowSeconds) && nowSeconds >= 0 && nowSeconds <= Number.MAX_SAFE_INTEGER - SESSION_MAX_AGE_SECONDS;
}

function decodeCanonical(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.toString('base64url') === value ? decoded : null;
}

type SessionPayload = {
  version: 1;
  owner: 'owner';
  iat: number;
  exp: number;
  nonce: string;
};

export function createSession(config: AuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): string {
  if (!validConfig(config)) throw new Error('Owner login is not configured.');
  if (!validNow(nowSeconds)) throw new Error('Cannot create a session with an invalid issue time.');
  const payload: SessionPayload = {
    version: 1,
    owner: 'owner',
    iat: nowSeconds,
    exp: nowSeconds + SESSION_MAX_AGE_SECONDS,
    nonce: randomBytes(24).toString('base64url'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', sessionKey(config)).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySession(token: string | undefined, config: AuthConfig, nowSeconds = Math.floor(Date.now() / 1_000)): boolean {
  if (!validConfig(config) || !validNow(nowSeconds) || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, signature] = parts;
  const decodedPayload = decodeCanonical(encoded);
  const decodedSignature = decodeCanonical(signature);
  if (!decodedPayload || !decodedSignature || decodedSignature.length !== 32) return false;
  const expectedSignature = createHmac('sha256', sessionKey(config)).update(encoded).digest();
  if (!timingSafeEqual(decodedSignature, expectedSignature)) return false;

  let value: unknown;
  try {
    value = JSON.parse(decodedPayload.toString('utf8'));
  } catch {
    return false;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).sort().join(',') !== 'exp,iat,nonce,owner,version') return false;
  if (payload.version !== 1 || payload.owner !== 'owner') return false;
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return false;
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat < 0) return false;
  if (payload.iat > nowSeconds || payload.exp <= nowSeconds || payload.exp - payload.iat !== SESSION_MAX_AGE_SECONDS) return false;
  if (typeof payload.nonce !== 'string') return false;
  const nonce = decodeCanonical(payload.nonce);
  return nonce !== null && nonce.length === 24;
}
