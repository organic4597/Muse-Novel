import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { createChapter, listChapters } from '@/lib/db/queries/chapters';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const chapters = await listChapters(db, id);

  return NextResponse.json(chapters);
}

export async function POST(
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
