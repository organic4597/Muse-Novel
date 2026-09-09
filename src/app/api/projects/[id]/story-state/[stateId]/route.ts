import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getChapter } from '@/lib/db/queries/chapters';
import { getCharacter } from '@/lib/db/queries/characters';
import { getWorldEntry } from '@/lib/db/queries/world-entries';
import {
  deleteStoryStateEntry,
  getStoryStateEntry,
  listStoryStateEntries,
  updateStoryStateEntry,
} from '@/lib/db/queries/story-state';
import { STORY_STATE_CATEGORIES } from '@/lib/story-state';

const updateSchema = z
  .object({
    category: z.enum(STORY_STATE_CATEGORIES).optional(),
    chapterId: z.string().uuid().nullable().optional(),
    endChapterId: z.string().uuid().nullable().optional(),
    characterId: z.string().uuid().nullable().optional(),
    worldEntryId: z.string().uuid().nullable().optional(),
    knowledgeScope: z.enum(['canon', 'reader', 'character']).optional(),
    knowerCharacterId: z.string().uuid().nullable().optional(),
    certainty: z.enum(['known', 'suspected', 'believed']).optional(),
    evidence: z.string().trim().max(2000).nullable().optional(),
    details: z.string().trim().max(4000).nullable().optional(),
    isActive: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    label: z.string().trim().min(1).max(120).optional(),
    previousValue: z.string().trim().max(1000).nullable().optional(),
    value: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

async function getOwnedEntry(projectId: string, stateId: string) {
  const entry = await getStoryStateEntry(db, stateId);
  return entry?.projectId === projectId ? entry : null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; stateId: string }> }
) {
  const { id, stateId } = await params;
  if (!(await getOwnedEntry(id, stateId))) {
    return NextResponse.json({ error: '상태 메모를 찾을 수 없습니다.' }, { status: 404 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '수정 내용을 확인해주세요.' }, { status: 400 });
  }
  const [character, chapter, endChapter, worldEntry, knower] = await Promise.all([
    parsed.data.characterId
      ? getCharacter(db, parsed.data.characterId)
      : null,
    parsed.data.chapterId ? getChapter(db, parsed.data.chapterId) : null,
    parsed.data.endChapterId ? getChapter(db, parsed.data.endChapterId) : null,
    parsed.data.worldEntryId ? getWorldEntry(db, parsed.data.worldEntryId) : null,
    parsed.data.knowerCharacterId ? getCharacter(db, parsed.data.knowerCharacterId) : null,
  ]);
  if (
    (parsed.data.characterId && character?.projectId !== id) ||
    (parsed.data.chapterId && chapter?.projectId !== id) ||
    (parsed.data.endChapterId && endChapter?.projectId !== id) ||
    (parsed.data.worldEntryId && worldEntry?.projectId !== id) ||
    (parsed.data.knowerCharacterId && knower?.projectId !== id)
  ) {
    return NextResponse.json(
      { error: '다른 프로젝트의 인물이나 챕터는 연결할 수 없습니다.' },
      { status: 400 }
    );
  }
  const existing = await getOwnedEntry(id, stateId);
  const scope = parsed.data.knowledgeScope ?? existing?.knowledgeScope;
  const knowerId = parsed.data.knowerCharacterId === undefined ? existing?.knowerCharacterId : parsed.data.knowerCharacterId;
  if (scope === 'character' && !knowerId) return NextResponse.json({ error: '이 정보를 알고 있는 인물을 선택해주세요.' }, { status: 400 });

  const { isActive, isPinned, ...fields } = parsed.data;
  await updateStoryStateEntry(db, stateId, {
    ...fields,
    ...(isActive === undefined
      ? {}
      : { isActive: isActive ? 1 : 0 }),
    ...(isPinned === undefined
      ? {}
      : { isPinned: isPinned ? 1 : 0 }),
  });
  const entries = await listStoryStateEntries(db, id);
  return NextResponse.json(entries.find((entry) => entry.id === stateId));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; stateId: string }> }
) {
  const { id, stateId } = await params;
  if (!(await getOwnedEntry(id, stateId))) {
    return NextResponse.json({ error: '상태 메모를 찾을 수 없습니다.' }, { status: 404 });
  }
  await deleteStoryStateEntry(db, stateId);
  return NextResponse.json({ success: true });
}
