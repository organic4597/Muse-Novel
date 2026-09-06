import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isAIRequestQueueFullError,
} from '@/lib/ai/request-scheduler';
import { runWritingAgent } from '@/lib/ai/writing-agent';
import { db } from '@/lib/db';
import { getChapter } from '@/lib/db/queries/chapters';
import { getProject } from '@/lib/db/queries/projects';
import {
  extractBoundedPlateText,
  InvalidPlateContentError,
} from '@/lib/editor/bounded-plate-content';
import { WEB_SEARCH_MODES } from '@/lib/web-research/types';

const REQUEST_TIMEOUT_MS = 600_000;
const requestSchema = z.object({
  webSearchMode: z.enum(WEB_SEARCH_MODES).default('auto'),
  chapterId: z.string().uuid().optional(),
  currentContentJson: z.string().max(300_000).optional(),
  cursorAfter: z.string().max(10_000).default(''),
  cursorBefore: z.string().max(20_000).default(''),
  instruction: z.string().trim().min(3).max(5000),
  review: z.boolean().default(true),
  targetLength: z.number().int().min(300).max(6000).default(1800),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const declaredLength = Number.parseInt(
    request.headers.get('content-length') ?? '0',
    10
  );
  if (Number.isFinite(declaredLength) && declaredLength > 400_000) {
    return NextResponse.json(
      { error: '집필 요청 크기가 한도를 초과했습니다.' },
      { status: 413 }
    );
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: '집필 요청은 3자 이상, 목표 분량은 300~6000자로 입력해주세요.' },
      { status: 400 }
    );
  }
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (parsed.data.chapterId) {
    const chapter = await getChapter(db, parsed.data.chapterId);
    if (!chapter || chapter.projectId !== id) {
      return NextResponse.json({ error: '챕터를 찾을 수 없습니다.' }, { status: 404 });
    }
  }

  let currentProse: string;
  try {
    currentProse = extractBoundedPlateText(parsed.data.currentContentJson);
  } catch (error) {
    if (error instanceof InvalidPlateContentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: '현재 원고를 읽지 못했습니다.' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const streamAbortController = new AbortController();
  let streamClosed = false;
  const signal = AbortSignal.any([
    request.signal,
    streamAbortController.signal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (streamClosed || signal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          streamClosed = true;
          streamAbortController.abort(
            new DOMException('Response stream closed', 'AbortError')
          );
        }
      };
      try {
        const result = await runWritingAgent({
          chapterId: parsed.data.chapterId,
          cursorAfter: parsed.data.cursorAfter,
          cursorBefore: parsed.data.cursorBefore,
          currentProse,
          db,
          instruction: parsed.data.instruction,
          webSearchMode: parsed.data.webSearchMode,
          onDelta: (text) => send('delta', { text }),
          onProgress: (progress) => send('progress', progress),
          projectId: id,
          requestId: request.headers.get('x-request-id') ?? undefined,
          review: parsed.data.review,
          signal,
          targetLength: parsed.data.targetLength,
        });
        send('done', result);
      } catch (error) {
        console.warn('[writing-agent] generation failed', error);
        const timedOut =
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError');
        send('error', {
          code: isAIRequestQueueFullError(error)
            ? 'ai_queue_full'
            : timedOut
              ? 'request_timeout'
              : 'generation_failed',
          message: isAIRequestQueueFullError(error)
            ? error.message
            : timedOut
              ? '집필 에이전트 응답 시간이 초과되었습니다.'
              : error instanceof Error &&
                  error.message === 'AI 제공자 설정이 없습니다.'
                ? error.message
                : '집필 에이전트 실행에 실패했습니다.',
        });
      } finally {
        if (!streamClosed) {
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // The consumer may have cancelled between the final event and close.
          }
        }
      }
    },
    cancel(reason) {
      streamClosed = true;
      streamAbortController.abort(
        reason instanceof Error
          ? reason
          : new DOMException('Response stream cancelled', 'AbortError')
      );
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
