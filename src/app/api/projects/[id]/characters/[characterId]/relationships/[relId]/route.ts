import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  deleteRelationship,
  getRelationship,
  updateRelationship,
} from '@/lib/db/queries/character-relationships';

export async function PUT(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; characterId: string; relId: string }> }
) {
  const { relId } = await params;
  const body = await request.json();

  const updated = await updateRelationship(db, relId, {
    relationshipType: body.relationshipType?.trim() || undefined,
    description: body.description ?? undefined,
  });

  if (!updated) {
    return NextResponse.json(
      { error: '관계를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; characterId: string; relId: string }> }
) {
  const { relId } = await params;
  const existing = await getRelationship(db, relId);

  if (!existing) {
    return NextResponse.json(
      { error: '관계를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  await deleteRelationship(db, relId);

  return NextResponse.json({ success: true });
}
