import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  createRelationship,
  listRelationshipsForCharacter,
} from '@/lib/db/queries/character-relationships';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;
  const relationships = await listRelationshipsForCharacter(db, characterId);

  return NextResponse.json(relationships);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; characterId: string }> }
) {
  const { characterId } = await params;
  const body = await request.json();

  if (
    !body.relationshipType ||
    typeof body.relationshipType !== 'string' ||
    !body.relationshipType.trim()
  ) {
    return NextResponse.json(
      { error: '관계 유형은 필수입니다.' },
      { status: 400 }
    );
  }

  if (!body.characterBId || typeof body.characterBId !== 'string') {
    return NextResponse.json(
      { error: '대상 캐릭터는 필수입니다.' },
      { status: 400 }
    );
  }

  if (body.characterBId === characterId) {
    return NextResponse.json(
      { error: '같은 캐릭터 간의 관계는 만들 수 없습니다.' },
      { status: 400 }
    );
  }

  const relationship = await createRelationship(db, {
    characterAId: characterId,
    characterBId: body.characterBId,
    relationshipType: body.relationshipType.trim(),
    description: body.description?.trim() || undefined,
  });

  return NextResponse.json(relationship, { status: 201 });
}
