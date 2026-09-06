import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { setSessionCookie } from '@/lib/auth/cookie';
import { sanitizeReturnTo } from '@/lib/auth/redirect';
import { getClientKey, hasSafeRequestOrigin } from '@/lib/auth/request';
import { isAuthConfigured, setupAdmin } from '@/lib/auth/service';
import {
  clearLoginFailures,
  getLoginThrottle,
  recordLoginFailure,
} from '@/lib/auth/throttle';

import { readAuthBody } from '../route-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const activeClients = new Set<string>();
let activeSetups = 0;

export async function POST(request: NextRequest) {
  if (!hasSafeRequestOrigin(request)) {
    return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 403 });
  }
  if (await isAuthConfigured()) {
    return NextResponse.json({ error: '관리자 설정이 이미 완료되었습니다.' }, { status: 409 });
  }

  const throttleKey = `setup:${getClientKey(request)}`;
  const throttle = getLoginThrottle(throttleKey);
  if (throttle.blocked) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(throttle.retryAfterSeconds) } }
    );
  }
  if (activeClients.has(throttleKey) || activeSetups >= 1) {
    return NextResponse.json(
      { error: '다른 초기 설정 요청을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': '2' } }
    );
  }

  activeClients.add(throttleKey);
  activeSetups += 1;
  try {
    const body = await readAuthBody(request);
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const setupToken = typeof body?.setupToken === 'string' ? body.setupToken : undefined;
    const returnTo = sanitizeReturnTo(body?.returnTo);
    if (!body || Buffer.byteLength(setupToken ?? '', 'utf8') > 1024) {
      recordLoginFailure(throttleKey);
      return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 });
    }

    const result = await setupAdmin(username, password, setupToken);
    if (!(result.ok && result.token && result.expiresAt)) {
      recordLoginFailure(throttleKey);
      const status = result.error?.includes('이미') ? 409 : 400;
      return NextResponse.json({ error: result.error ?? '입력값을 확인해 주세요.' }, { status });
    }

    clearLoginFailures(throttleKey);
    const response = NextResponse.json({ ok: true, redirectTo: returnTo });
    setSessionCookie(response, request, result.token, result.expiresAt);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: '설정을 완료하지 못했습니다.' }, { status: 500 });
  } finally {
    activeClients.delete(throttleKey);
    activeSetups = Math.max(0, activeSetups - 1);
  }
}
