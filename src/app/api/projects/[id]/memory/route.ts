import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import {
  indexProjectMemory,
  retrieveProjectMemory,
} from '@/lib/memory/project-memory';

const indexRequestSchema = z.object({
  action: z.literal('index').default('index'),
});

const searchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(8),
  q: z.string().trim().min(1).max(4000),
});

const REQUEST_TIMEOUT_MS = 600_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    q: url.searchParams.get('q'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: '검색어를 1자 이상 입력해주세요.' },
      { status: 400 }
    );
  }
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const result = await retrieveProjectMemory(db, id, parsed.data.q, {
    limit: parsed.data.limit,
    signal: AbortSignal.any([
      request.signal,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]),
  });
  return NextResponse.json(result);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = indexRequestSchema.safeParse(
    await request.json().catch(() => ({ action: 'index' }))
  );
  if (!parsed.success) {
    return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
  }
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    const result = await indexProjectMemory(
      db,
      id,
      AbortSignal.any([
        request.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ])
    );
    return NextResponse.json(result);
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError');
    return NextResponse.json(
      {
        error: timedOut
          ? '기억 인덱스 생성 시간이 초과되었습니다.'
          : '기억 인덱스를 생성하지 못했습니다.',
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}

