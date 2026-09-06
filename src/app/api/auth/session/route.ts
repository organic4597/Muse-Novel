import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getRequestSession } from '@/lib/auth/request';
import { isAuthConfigured } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const [configured, session] = await Promise.all([
    isAuthConfigured(),
    getRequestSession(request),
  ]);
  return NextResponse.json(
    {
      authenticated: Boolean(session),
      configured,
      expiresAt: session?.expiresAt ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
