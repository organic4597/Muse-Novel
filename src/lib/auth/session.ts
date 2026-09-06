import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { SESSION_DURATION_SECONDS } from './constants';
import { ensureSessionSecret, readCredential, readSessionSecret } from './storage';
import type { SessionClaims } from './types';

const MAX_TOKEN_LENGTH = 1024;
const CLOCK_SKEW_SECONDS = 300;

function signPayload(payload: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

function parseClaims(payload: string): SessionClaims | null {
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Partial<SessionClaims>;
    if (
      parsed.version !== 1 ||
      typeof parsed.sessionId !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(parsed.sessionId) ||
      !Number.isSafeInteger(parsed.issuedAt) ||
      !Number.isSafeInteger(parsed.expiresAt) ||
      !Number.isSafeInteger(parsed.epoch)
    ) {
      return null;
    }
    return parsed as SessionClaims;
  } catch {
    return null;
  }
}

export async function createSessionToken(now = Date.now()): Promise<{
  token: string;
  claims: SessionClaims;
}> {
  const credential = await readCredential();
  if (!credential) {
    throw new Error('Authentication is not configured');
  }
  const secret = await ensureSessionSecret();
  const issuedAt = Math.floor(now / 1000);
  const claims: SessionClaims = {
    version: 1,
    sessionId: randomBytes(32).toString('base64url'),
    issuedAt,
    expiresAt: issuedAt + SESSION_DURATION_SECONDS,
    epoch: credential.sessionEpoch,
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = signPayload(payload, secret).toString('base64url');
  return { claims, token: `${payload}.${signature}` };
}

export async function validateSessionToken(
  token: string | null | undefined,
  now = Date.now()
): Promise<SessionClaims | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const pieces = token.split('.');
  if (pieces.length !== 2) {
    return null;
  }
  const [payload, encodedSignature] = pieces;
  if (!payload || !encodedSignature) {
    return null;
  }
  if (
    !/^[A-Za-z0-9_-]+$/u.test(payload) ||
    !/^[A-Za-z0-9_-]+$/u.test(encodedSignature)
  ) {
    return null;
  }

  const [credential, secret] = await Promise.all([readCredential(), readSessionSecret()]);
  if (!credential || !secret) {
    return null;
  }

  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return null;
  }
  // Node's base64url decoder accepts non-canonical trailing pad bits. Reject
  // alternate spellings so one signed session has exactly one token value.
  if (receivedSignature.toString('base64url') !== encodedSignature) {
    return null;
  }
  const expectedSignature = signPayload(payload, secret);
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }

  const claims = parseClaims(payload);
  if (!claims) {
    return null;
  }

  const nowSeconds = Math.floor(now / 1000);
  if (
    claims.epoch !== credential.sessionEpoch ||
    claims.issuedAt > nowSeconds + CLOCK_SKEW_SECONDS ||
    claims.expiresAt <= nowSeconds ||
    claims.expiresAt - claims.issuedAt > SESSION_DURATION_SECONDS + CLOCK_SKEW_SECONDS
  ) {
    return null;
  }
  return claims;
}

export function fingerprintSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}
