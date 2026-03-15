import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createCharacter,
  listCharacters,
} from '@/lib/db/queries/characters';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const characters = await listCharacters(db, id);

  return NextResponse.json(characters);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json(
      { error: '이름은 필수입니다.' },
      { status: 400 }
    );
  }

  const character = await createCharacter(db, {
    projectId: id,
    name: body.name.trim(),
    role: body.role ?? undefined,
    appearance: body.appearance ?? undefined,
    personality: body.personality ?? undefined,
    backstory: body.backstory ?? undefined,
    arcDescription: body.arcDescription ?? undefined,
    itemsJson: body.itemsJson ?? undefined,
  });

  return NextResponse.json(character, { status: 201 });
}
