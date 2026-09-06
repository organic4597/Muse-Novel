import { NextResponse } from 'next/server';

import { generateWorldEntrySuggestion } from '@/lib/ai/entity-suggestions';
import { isAIRequestQueueFullError } from '@/lib/ai/request-scheduler';

const REQUEST_TIMEOUT_MS = 600_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.description || typeof body.description !== 'string' || !body.description.trim()) {
    return NextResponse.json(
      { error: '설명은 필수입니다.' },
      { status: 400 }
    );
  }

  try {
    const suggestion = await generateWorldEntrySuggestion({
      abortSignal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
      projectId: id,
      description: body.description.trim(),
      requestId: request.headers.get('x-request-id') ?? undefined,
    });

    return NextResponse.json(suggestion);
  } catch (error) {
    if (isAIRequestQueueFullError(error)) {
      return NextResponse.json(
        {
          code: 'ai_queue_full',
          error: error.message,
        },
        {
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
          status: 429,
        }
      );
    }

    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError');
    return NextResponse.json(
      {
        error:
          isTimeout
            ? 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
            : error instanceof Error
            ? error.message
            : '세계관 제안을 생성하지 못했습니다.',
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
