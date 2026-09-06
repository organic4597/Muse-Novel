import { NextResponse } from 'next/server';
import { z } from 'zod';
import { affiliationEventInputSchema } from '@/lib/character-affiliations';
import { db } from '@/lib/db';
import { CharacterAffiliationError, deleteAffiliationEvent, getCharacterAffiliations, updateAffiliationEvent } from '@/lib/db/queries/character-affiliations';

const schema = z.object({ expectedRevision: z.number().int().nonnegative() });
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; characterId: string; eventId: string }> }) {
  try {
    const { id, characterId, eventId } = await params;
    const parsed = affiliationEventInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '소속 정정 내용을 확인해주세요.' }, { status: 400 });
    await updateAffiliationEvent(db, { projectId: id, characterId, eventId }, parsed.data);
    return NextResponse.json(await getCharacterAffiliations(db, id, characterId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof CharacterAffiliationError ? error.message : '소속 기록을 정정하지 못했습니다.' },
      { status: error instanceof CharacterAffiliationError ? error.status : 500 });
  }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; characterId: string; eventId: string }> }) {
  try {
    const { id, characterId, eventId } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: '최신 소속 이력을 다시 확인해주세요.' }, { status: 400 });
    await deleteAffiliationEvent(db, { projectId: id, characterId, eventId, expectedRevision: parsed.data.expectedRevision });
    return NextResponse.json(await getCharacterAffiliations(db, id, characterId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof CharacterAffiliationError ? error.message : '소속 기록을 삭제하지 못했습니다.' },
      { status: error instanceof CharacterAffiliationError ? error.status : 500 });
  }
}
