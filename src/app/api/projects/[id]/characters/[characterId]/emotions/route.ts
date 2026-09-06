import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createEmotion,
  listEmotionsForCharacter,
} from '@/lib/db/queries/character-emotions';
import { getCharacter } from '@/lib/db/queries/characters';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;

  const character = await getCharacter(db, characterId);
  if (!character) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const emotions = await listEmotionsForCharacter(db, characterId);
  return NextResponse.json({ emotions });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;

  const character = await getCharacter(db, characterId);
  if (!character) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const body = await request.json();

  if (!body.chapterId || typeof body.chapterId !== 'string') {
    return NextResponse.json(
      { error: '챕터 ID가 필요합니다.' },
      { status: 400 }
    );
  }

  if (!body.emotion || typeof body.emotion !== 'string' || !body.emotion.trim()) {
    return NextResponse.json(
      { error: '감정은 필수입니다.' },
      { status: 400 }
    );
  }

  const emotion = await createEmotion(db, {
    characterId,
    chapterId: body.chapterId,
    emotion: body.emotion.trim(),
    note: typeof body.note === 'string' ? body.note : undefined,
  });

  return NextResponse.json(emotion, { status: 201 });
}
