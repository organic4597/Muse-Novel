import type { NextRequest } from 'next/server';

import { hashPassword, validatePassword, verifyPassword } from './password';
import { getRequestSession, isValidUsername, safeUsernameEqual } from './request';
import { createSessionToken, validateSessionToken } from './session';
import { verifySetupToken } from './setup-token';
import {
  createInitialCredential,
  hasCredential,
  incrementSessionEpoch,
  readCredential,
} from './storage';

let setupInProgress = false;

export async function isAuthConfigured(): Promise<boolean> {
  return hasCredential();
}

export async function setupAdmin(username: string, password: string, setupToken?: string): Promise<{
  ok: boolean;
  error?: string;
  token?: string;
  expiresAt?: number;
}> {
  if (!verifySetupToken(setupToken)) {
    return { ok: false, error: '초기 설정 코드가 올바르지 않습니다.' };
  }
  const normalizedUsername = username.trim().normalize('NFKC');
  if (!isValidUsername(normalizedUsername)) {
    return { ok: false, error: '아이디는 2~64자로 입력해 주세요.' };
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, error: passwordError };
  }
  if (await hasCredential()) {
    return { ok: false, error: '관리자 설정이 이미 완료되었습니다.' };
  }

  if (setupInProgress) {
    return { ok: false, error: '관리자 설정이 진행 중입니다. 잠시 후 다시 시도해 주세요.' };
  }

  setupInProgress = true;
  try {
    const timestamp = new Date().toISOString();
    const passwordDigest = await hashPassword(password);
    const created = await createInitialCredential({
      schemaVersion: 1,
      username: normalizedUsername,
      password: passwordDigest,
      sessionEpoch: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (!created) {
      return { ok: false, error: '관리자 설정이 이미 완료되었습니다.' };
    }

    const session = await createSessionToken();
    return {
      ok: true,
      token: session.token,
      expiresAt: session.claims.expiresAt,
    };
  } finally {
    setupInProgress = false;
  }
}

export async function authenticateAdmin(username: string, password: string): Promise<{
  ok: boolean;
  token?: string;
  expiresAt?: number;
}> {
  const credential = await readCredential();
  if (!credential) {
    return { ok: false };
  }

  const [passwordMatches, usernameMatches] = await Promise.all([
    verifyPassword(password, credential.password),
    Promise.resolve(safeUsernameEqual(username, credential.username)),
  ]);
  if (!(passwordMatches && usernameMatches)) {
    return { ok: false };
  }

  const session = await createSessionToken();
  return {
    ok: true,
    token: session.token,
    expiresAt: session.claims.expiresAt,
  };
}

export async function revokeSessions(): Promise<void> {
  if ((await incrementSessionEpoch()) === null) {
    throw new Error('Could not revoke authentication sessions');
  }
}

export async function isSessionTokenValid(token: string | null | undefined): Promise<boolean> {
  return (await validateSessionToken(token)) !== null;
}

export async function isRequestAuthenticated(request: NextRequest): Promise<boolean> {
  return (await getRequestSession(request)) !== null;
}
