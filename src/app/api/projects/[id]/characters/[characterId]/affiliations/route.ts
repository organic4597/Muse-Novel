import { NextResponse } from 'next/server';
import { affiliationEventInputSchema } from '@/lib/character-affiliations';
import { db } from '@/lib/db';
import { CharacterAffiliationError, createAffiliationEvent, getCharacterAffiliations } from '@/lib/db/queries/character-affiliations';

type Context = { params: Promise<{ id: string; characterId: string }> };
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof CharacterAffiliationError ? error.message : '소속 정보를 처리하지 못했습니다.' },
    { status: error instanceof CharacterAffiliationError ? error.status : 500 });
}

export async function GET(request: Request, context: Context) {
  try {
    const { id, characterId } = await context.params;
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await getCharacterAffiliations(db, id, characterId, {
      chapterId: params.get('chapterId') ?? undefined,
      boundary: params.get('boundary') === 'end' ? 'end' : 'start',
    }));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id, characterId } = await context.params;
    const parsed = affiliationEventInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '소속 변경 내용을 확인해주세요.' }, { status: 400 });
    await createAffiliationEvent(db, id, characterId, parsed.data);
    return NextResponse.json(await getCharacterAffiliations(db, id, characterId), { status: 201 });
  } catch (error) { return failure(error); }
}
