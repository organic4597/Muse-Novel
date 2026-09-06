import { NextResponse } from 'next/server';
import { z } from 'zod';

import { testExternalService } from '@/lib/external-services/client';
import { searchWeb } from '@/lib/web-research/search';

const requestSchema = z.object({
  baseUrl: z.string().trim().min(1),
  healthPath: z.enum(['/health', '/v1/models']).optional(),
  serviceType: z.enum(['tag-recommender', 'lora-training', 'embedding', 'web-search']).optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'API URL을 입력하세요.' },
      { status: 400 }
    );
  }

  if (parsed.data.serviceType === 'web-search') {
    try {
      const sources = await searchWeb(parsed.data.baseUrl, 'SearXNG', request.signal);
      return NextResponse.json({ ok: true, message: `검색 API 연결 성공 · 검색 결과 ${sources.length}개` });
    } catch {
      return NextResponse.json({ ok: false, message: '검색 API에 연결하지 못했습니다. 주소와 JSON 검색 활성화 설정을 확인해주세요.' }, { status: 503 });
    }
  }
  const result = await testExternalService(
    parsed.data.baseUrl,
    parsed.data.healthPath,
    parsed.data.serviceType === 'embedding'
      ? { bearerToken: process.env.EMBEDDING_API_KEY?.trim() || undefined }
      : undefined
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
