import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  deleteChapter,
  getChapter,
  updateChapter,
} from '@/lib/db/queries/chapters';

const updateChapterSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    outline: z.string().max(20_000).optional(),
    summary: z.string().max(20_000).optional(),
    memo: z.string().max(20_000).optional(),
    wordCount: z.number().int().min(0).optional(),
  })
  .strict();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await params;
  const chapter = await getChapter(db, chapterId);

  if (!chapter || chapter.projectId !== id) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(chapter);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await params;
  const existing = await getChapter(db, chapterId);
  if (!existing || existing.projectId !== id) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const parsed = updateChapterSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: '챕터 정보 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const updated = await updateChapter(db, chapterId, {
    title: parsed.data.title,
    outline: parsed.data.outline,
    summary: parsed.data.summary,
    memo: parsed.data.memo,
    wordCount: parsed.data.wordCount,
  });

  if (!updated) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await params;
  const existing = await getChapter(db, chapterId);

  if (!existing || existing.projectId !== id) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteChapter(db, chapterId);

  return new NextResponse(null, { status: 204 });
}
