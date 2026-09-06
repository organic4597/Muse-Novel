import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { setSessionCookie } from '@/lib/auth/cookie';
import { sanitizeReturnTo } from '@/lib/auth/redirect';
import { getClientKey, hasSafeRequestOrigin } from '@/lib/auth/request';
import { authenticateAdmin, isAuthConfigured } from '@/lib/auth/service';
import {
  clearLoginFailures,
  getLoginThrottle,
  recordLoginFailure,
} from '@/lib/auth/throttle';

import { readAuthBody } from '../route-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INVALID_CREDENTIALS = '아이디 또는 비밀번호가 올바르지 않습니다.';
const activeClients = new Set<string>();
let activeLogins = 0;

export async function POST(request: NextRequest) {
  if (!hasSafeRequestOrigin(request)) {
    return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 403 });
  }
  if (!(await isAuthConfigured())) {
    return NextResponse.json(
      { code: 'AUTH_SETUP_REQUIRED', error: '관리자 초기 설정이 필요합니다.' },
      { status: 409 }
    );
  }

  const throttleKey = `login:${getClientKey(request)}`;
  const throttle = getLoginThrottle(throttleKey);
  if (throttle.blocked) {
    return NextResponse.json(
      { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } }
    );
  }
  if (activeClients.has(throttleKey) || activeLogins >= 2) {
    return NextResponse.json(
      { error: '다른 로그인 요청을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': '2' } }
    );
  }

  activeClients.add(throttleKey);
  activeLogins += 1;
  try {
    const body = await readAuthBody(request);
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const returnTo = sanitizeReturnTo(body?.returnTo);
    if (!body || username.length > 128 || Buffer.byteLength(password, 'utf8') > 1024) {
      recordLoginFailure(throttleKey);
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    const result = await authenticateAdmin(username, password);
    if (!(result.ok && result.token && result.expiresAt)) {
      recordLoginFailure(throttleKey);
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    clearLoginFailures(throttleKey);
    const response = NextResponse.json({ ok: true, redirectTo: returnTo });
    setSessionCookie(response, request, result.token, result.expiresAt);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: '로그인 요청을 처리하지 못했습니다.' }, { status: 500 });
  } finally {
    activeClients.delete(throttleKey);
    activeLogins = Math.max(0, activeLogins - 1);
  }
}
