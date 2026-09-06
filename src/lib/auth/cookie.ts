import type { NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME } from './constants';
import { isSecureRequest } from './request';

export function setSessionCookie(
  response: NextResponse,
  request: NextRequest,
  token: string,
  expiresAt: number
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    expires: new Date(expiresAt * 1000),
    maxAge: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    priority: 'high',
  });
}

export function clearSessionCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    priority: 'high',
  });
}
