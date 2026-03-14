import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteChapter,
  getChapter,
  updateChapter,
} from '@/lib/db/queries/chapters';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { chapterId } = await params;
  const chapter = await getChapter(db, chapterId);

  if (!chapter) {
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
  const { chapterId } = await params;
  const body = await request.json();

  const updated = await updateChapter(db, chapterId, {
    title: body.title ?? undefined,
    outline: body.outline ?? undefined,
    summary: body.summary ?? undefined,
    memo: body.memo ?? undefined,
    wordCount: body.wordCount ?? undefined,
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
  const { chapterId } = await params;
  const existing = await getChapter(db, chapterId);

  if (!existing) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteChapter(db, chapterId);

  return new NextResponse(null, { status: 204 });
}
