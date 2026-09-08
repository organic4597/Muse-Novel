import { NextResponse } from 'next/server';
import {
  isAIRequestQueueFullError,
} from '@/lib/ai/request-scheduler';
import { analyzeStoryConsistency } from '@/lib/ai/story-consistency';
import { longTaskResponse } from '@/lib/ai/long-task-stream';
import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';

const REQUEST_TIMEOUT_MS = 600_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (request.headers.get('accept')?.includes('text/event-stream')) {
    return longTaskResponse(request, (signal, progress) => analyzeStoryConsistency({ db, projectId: id, signal, progress }));
  }

  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]);
  try {
    const report = await analyzeStoryConsistency({
      db,
      projectId: id,
      requestId: request.headers.get('x-request-id') ?? undefined,
      signal,
    });
    return NextResponse.json(report);
  } catch (error) {
    console.warn('[consistency] analysis failed', error);
    if (isAIRequestQueueFullError(error)) {
      return NextResponse.json(
        { code: 'ai_queue_full', error: error.message },
        {
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
          status: 429,
        }
      );
    }
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError');
    return NextResponse.json(
      {
        error: timedOut
          ? '일관성 검사 시간이 초과되었습니다.'
          : error instanceof Error &&
              error.message === 'AI 제공자 설정이 없습니다.'
            ? error.message
            : '일관성 검사에 실패했습니다.',
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
