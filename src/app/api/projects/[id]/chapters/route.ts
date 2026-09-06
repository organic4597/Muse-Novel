import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createChapter,
  listChapterSummaries,
} from '@/lib/db/queries/chapters';
import { observeApiHandler } from '@/lib/observability/server-metrics';

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
  const body = await request.json();

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json(
      { error: '제목은 필수입니다.' },
      { status: 400 }
    );
  }

  const chapter = await createChapter(db, {
    projectId: id,
    title: body.title.trim(),
    order: body.order ?? undefined,
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
