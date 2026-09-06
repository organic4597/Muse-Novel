import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { AUTH_PUBLIC_PATHS, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { sanitizeReturnTo } from '@/lib/auth/redirect';
import { hasSafeMutationMetadata } from '@/lib/auth/request';
import { validateSessionToken } from '@/lib/auth/session';
import { hasCredential } from '@/lib/auth/storage';

function isPublicPath(pathname: string): boolean {
  return AUTH_PUBLIC_PATHS.has(pathname);
}

function loginUrl(request: NextRequest): URL {
  const url = new URL('/login', request.url);
  const returnTo = sanitizeReturnTo(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (returnTo !== '/') {
    url.searchParams.set('returnTo', returnTo);
  }
  return url;
}

function setupUrl(request: NextRequest): URL {
  const url = new URL('/setup', request.url);
  const returnTo = sanitizeReturnTo(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (returnTo !== '/') {
    url.searchParams.set('returnTo', returnTo);
  }
  return url;
}

function unauthorizedApiResponse(setupRequired = false): NextResponse {
  return NextResponse.json(
    setupRequired
      ? { code: 'AUTH_SETUP_REQUIRED', error: '관리자 초기 설정이 필요합니다.' }
      : { code: 'AUTH_REQUIRED', error: '로그인이 필요합니다.' },
    {
      status: setupRequired ? 503 : 401,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  if (!hasSafeMutationMetadata(request)) {
    return NextResponse.json(
      { code: 'UNSAFE_REQUEST_ORIGIN', error: '허용되지 않은 요청 출처입니다.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  const configured = await hasCredential();
  const session = configured
    ? await validateSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)
    : null;

  if (!configured) {
    if (pathname === '/setup' || isPublicPath(pathname)) {
      return NextResponse.next();
    }
    if (pathname.startsWith('/api/')) {
      return unauthorizedApiResponse(true);
    }
    return NextResponse.redirect(setupUrl(request));
  }

  if (pathname === '/setup') {
    return NextResponse.redirect(new URL(session ? '/' : '/login', request.url));
  }
  if (pathname === '/login') {
    if (!session) {
      return NextResponse.next();
    }
    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo'));
    return NextResponse.redirect(new URL(returnTo, request.url));
  }
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }
  if (session) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return unauthorizedApiResponse();
  }
  return NextResponse.redirect(loginUrl(request));
}

export const config = {
  matcher: [
    '/api/:path*',
    // Only immutable framework assets stay public. User-created files under
    // /uploads and image optimizer requests must pass session validation too.
    '/((?!_next/static|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
