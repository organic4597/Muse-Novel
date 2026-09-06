import { NextResponse } from 'next/server';

import { Automatic1111Client } from '@/lib/image-gen/automatic1111-client';
import { DiffusersApiClient } from '@/lib/image-gen/diffusers-api-client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const baseUrl = searchParams.get('baseUrl');
  const providerType = searchParams.get('providerType') || 'diffusers';

  if (!baseUrl) {
    return NextResponse.json(
      { status: 'error', message: 'baseUrl이 필요합니다.' },
      { status: 400 }
    );
  }

  const client =
    providerType === 'diffusers'
      ? new DiffusersApiClient(baseUrl)
      : new Automatic1111Client(baseUrl);
  const result = await client.checkConnection();

  return NextResponse.json({
    status: result.ok ? 'ok' : 'error',
    message: result.message,
  });
}
