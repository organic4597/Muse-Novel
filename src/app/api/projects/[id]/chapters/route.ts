import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  createChapter,
  listChapterSummaries,
} from '@/lib/db/queries/chapters';
import { observeApiHandler } from '@/lib/observability/server-metrics';
import { getProject } from '@/lib/db/queries/projects';

const createChapterSchema = z.object({
  title: z.string().trim().max(200).optional(),
  order: z.number().int().nonnegative().max(1_000_000).optional(),
});

async function getChapters(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chapters = await listChapterSummaries(db, id);

  return NextResponse.json(chapters);
}

async function createChapterHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = createChapterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: '챕터 제목과 순서 형식을 확인해주세요.' },
      { status: 400 }
    );
  }
  if (!await getProject(db, id)) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }

  const chapter = await createChapter(db, {
    projectId: id,
    title: parsed.data.title,
    order: parsed.data.order,
  });

  return NextResponse.json(chapter, { status: 201 });
}

export const GET = observeApiHandler(
  '/api/projects/[id]/chapters',
  'GET',
  getChapters
);
export const POST = observeApiHandler(
  '/api/projects/[id]/chapters',
  'POST',
  createChapterHandler
);
