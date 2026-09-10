import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteCharacter,
  getCharacter,
  updateCharacter,
} from '@/lib/db/queries/characters';
import { parseEntityPatch } from '@/lib/entity-revisions';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { id, characterId } = await params;
  const character = await getCharacter(db, characterId);

  if (!character || character.projectId !== id) {
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
  const { id, characterId } = await params;
  const existing = await getCharacter(db, characterId);
  if (!existing || existing.projectId !== id) return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
  let body;
  try { body = parseEntityPatch('character', await request.json()); }
  catch { return NextResponse.json({ error: '캐릭터 수정 값의 형식을 확인해주세요.' }, { status: 400 }); }

  if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
    return NextResponse.json(
      { error: '이름은 필수입니다.' },
      { status: 400 }
    );
  }

  const updated = await updateCharacter(db, characterId, {
    name: body.name?.trim() ?? undefined,
    role: body.role,
    appearance: body.appearance,
    personality: body.personality,
    backstory: body.backstory,
    arcDescription: body.arcDescription,
    voiceGuide: body.voiceGuide,
    voiceExamplesJson: body.voiceExamplesJson,
    itemsJson: body.itemsJson,
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
  const { id, characterId } = await params;
  const existing = await getCharacter(db, characterId);

  if (!existing || existing.projectId !== id) {
    return NextResponse.json(
      { error: '캐릭터를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteCharacter(db, characterId);

  return NextResponse.json({ success: true });
}
