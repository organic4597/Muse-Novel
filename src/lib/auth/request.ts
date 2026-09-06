import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from './constants';
import { validateSessionToken } from './session';

export function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function isValidUsername(username: string): boolean {
  const normalized = username.trim().normalize('NFKC');
  return normalized.length >= 2 && normalized.length <= 64 && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(normalized);
}

export function safeUsernameEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(normalizeUsername(left)).digest();
  const rightDigest = createHash('sha256').update(normalizeUsername(right)).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function getClientKey(request: NextRequest): string {
  if (process.env.AUTH_TRUST_PROXY !== '1') {
    return 'direct-client';
  }
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || request.headers.get('x-real-ip') || 'proxy-client';
  return candidate.slice(0, 128);
}

export function isSecureRequest(request: NextRequest): boolean {
  const forwardedProtocol =
    process.env.AUTH_TRUST_PROXY === '1'
      ? request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
      : undefined;
  return forwardedProtocol ? forwardedProtocol === 'https' : request.nextUrl.protocol === 'https:';
}

function expectedRequestOrigin(request: NextRequest): string {
  if (process.env.AUTH_TRUST_PROXY !== '1') {
    const host = request.headers.get('host')?.trim() || request.nextUrl.host;
    return `${request.nextUrl.protocol}//${host}`;
  }
  const expectedHost =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.nextUrl.host;
  const expectedProtocol =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    request.nextUrl.protocol.replace(':', '');
  return `${expectedProtocol}://${expectedHost}`;
}

export function hasSafeRequestOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.origin === expectedRequestOrigin(request);
  } catch {
    return false;
  }
}

export function hasSafeMutationMetadata(request: NextRequest): boolean {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return true;
  }
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  // Browsers omit Fetch Metadata for non-trustworthy URLs, including LAN HTTP.
  // Exact Origin validation remains mandatory; metadata, when present, must agree.
  if (!origin || (fetchSite !== null && fetchSite !== 'same-origin')) {
    return false;
  }
  try {
    return new URL(origin).origin === expectedRequestOrigin(request);
  } catch {
    return false;
  }
}

export async function getRequestSession(request: NextRequest) {
  return validateSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}
