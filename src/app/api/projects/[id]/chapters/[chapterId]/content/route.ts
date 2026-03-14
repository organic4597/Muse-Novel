import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getChapter, updateContent } from '@/lib/db/queries/chapters';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { chapterId } = await params;

  let body: { contentJson?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '잘못된 요청 형식입니다.' },
      { status: 400 }
    );
  }

  if (typeof body.contentJson !== 'string') {
    return NextResponse.json(
      { error: 'contentJson 문자열이 필요합니다.' },
      { status: 400 }
    );
  }

  const existing = await getChapter(db, chapterId);

  if (!existing) {
    return NextResponse.json(
      { error: '챕터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const updated = await updateContent(db, chapterId, body.contentJson);

  return NextResponse.json(updated);
}
