import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteCharacter,
  getCharacter,
  updateCharacter,
} from '@/lib/db/queries/characters';

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

  return NextResponse.json(character);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;
  const body = await request.json();

  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    return NextResponse.json(
      { error: '이름은 필수입니다.' },
      { status: 400 }
    );
  }

  const updated = await updateCharacter(db, characterId, {
    name: body.name?.trim() ?? undefined,
    role: body.role ?? undefined,
    appearance: body.appearance ?? undefined,
    personality: body.personality ?? undefined,
    backstory: body.backstory ?? undefined,
    arcDescription: body.arcDescription ?? undefined,
  });

  if (!updated) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;
  const existing = await getCharacter(db, characterId);

  if (!existing) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteCharacter(db, characterId);

  return NextResponse.json({ success: true });
}
