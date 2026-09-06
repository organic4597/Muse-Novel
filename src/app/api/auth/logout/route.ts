import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { clearSessionCookie } from '@/lib/auth/cookie';
import { hasSafeRequestOrigin } from '@/lib/auth/request';
import { isRequestAuthenticated, revokeSessions } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!hasSafeRequestOrigin(request)) {
    return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 403 });
  }

  if (await isRequestAuthenticated(request)) {
    await revokeSessions();
  }

  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.headers.set('Location', '/login');
  clearSessionCookie(response, request);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
