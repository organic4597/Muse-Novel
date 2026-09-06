import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteEmotion,
  updateEmotion,
} from '@/lib/db/queries/character-emotions';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string; emotionId: string }> }
) {
  const { emotionId } = await params;

  const body = await request.json();

  const updated = await updateEmotion(db, emotionId, {
    emotion: typeof body.emotion === 'string' ? body.emotion.trim() : undefined,
    note: typeof body.note === 'string' ? body.note : undefined,
  });

  if (!updated) {
    return NextResponse.json(
      { error: '감정 항목을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string; emotionId: string }> }
) {
  const { emotionId } = await params;
  await deleteEmotion(db, emotionId);
  return NextResponse.json({ success: true });
}
