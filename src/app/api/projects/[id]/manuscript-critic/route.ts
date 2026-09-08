import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  analyzeManuscript,
  MANUSCRIPT_CRITIC_INTENSITIES,
} from '@/lib/ai/manuscript-critic';
import { isAIRequestQueueFullError } from '@/lib/ai/request-scheduler';
import { longTaskResponse } from '@/lib/ai/long-task-stream';
import { getScene } from '@/lib/db/queries/writing-workbench';
import { db } from '@/lib/db';
import { getChapter } from '@/lib/db/queries/chapters';
import { getProject } from '@/lib/db/queries/projects';
import {
  extractBoundedPlateText,
  InvalidPlateContentError,
} from '@/lib/editor/bounded-plate-content';

const REQUEST_TIMEOUT_MS = 600_000;
const requestSchema = z.object({
  chapterId: z.string().uuid(),
  currentContentJson: z.string().max(300_000),
  intensity: z.enum(MANUSCRIPT_CRITIC_INTENSITIES).default('bold'),
  sceneId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: '비평할 현재 챕터 원고를 확인해주세요.' },
      { status: 400 }
    );
  }
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  const chapter = await getChapter(db, parsed.data.chapterId);
  if (!chapter || chapter.projectId !== id) {
    return NextResponse.json({ error: '챕터를 찾을 수 없습니다.' }, { status: 404 });
  }

  let currentProse: string;
  try {
    currentProse = extractBoundedPlateText(parsed.data.currentContentJson);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof InvalidPlateContentError
            ? error.message
            : '현재 원고를 읽지 못했습니다.',
      },
      { status: 400 }
    );
  }
  if (currentProse.trim().length < 50) {
    return NextResponse.json(
      { error: '문장 비평에는 50자 이상의 원고가 필요합니다.' },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.sceneId) getScene(db, id, parsed.data.chapterId, parsed.data.sceneId);
    if (request.headers.get('accept')?.includes('text/event-stream')) {
      return longTaskResponse(request, (signal, progress) => analyzeManuscript({
        chapterId: parsed.data.chapterId, currentProse, db, projectId: id,
        intensity: parsed.data.intensity, sceneId: parsed.data.sceneId, signal, progress,
      }));
    }
    const report = await analyzeManuscript({
      sceneId: parsed.data.sceneId,
      chapterId: parsed.data.chapterId,
      currentProse,
      db,
      intensity: parsed.data.intensity,
      projectId: id,
      requestId: request.headers.get('x-request-id') ?? undefined,
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    });
    return NextResponse.json(report);
  } catch (error) {
    console.warn('[manuscript-critic] analysis failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
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
          ? '문장 비평 응답 시간이 초과되었습니다.'
          : error instanceof Error && error.message === 'AI 제공자 설정이 없습니다.'
            ? error.message
            : '문장 비평에 실패했습니다.',
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
