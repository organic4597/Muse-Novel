import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getChapter } from '@/lib/db/queries/chapters';
import { getCharacter } from '@/lib/db/queries/characters';
import { getProject } from '@/lib/db/queries/projects';
import {
  createStoryStateEntry,
  listStoryStateEntries,
} from '@/lib/db/queries/story-state';
import { STORY_STATE_CATEGORIES } from '@/lib/story-state';

const createSchema = z.object({
  category: z.enum(STORY_STATE_CATEGORIES),
  chapterId: z.string().uuid().nullable().optional(),
  characterId: z.string().uuid().nullable().optional(),
  details: z.string().trim().max(4000).nullable().optional(),
  isActive: z.boolean().default(true),
  isPinned: z.boolean().default(false),
  label: z.string().trim().min(1).max(120),
  previousValue: z.string().trim().max(1000).nullable().optional(),
  value: z.string().trim().min(1).max(1000),
});

async function validateReferences(
  projectId: string,
  characterId?: string | null,
  chapterId?: string | null
) {
  const [character, chapter] = await Promise.all([
    characterId ? getCharacter(db, characterId) : null,
    chapterId ? getChapter(db, chapterId) : null,
  ]);
  if (characterId && character?.projectId !== projectId) return false;
  if (chapterId && chapter?.projectId !== projectId) return false;
  return true;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  const activeOnly = new URL(request.url).searchParams.get('active') === '1';
  return NextResponse.json(
    await listStoryStateEntries(db, id, { activeOnly })
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: '분류, 항목 이름과 현재 값을 확인해주세요.' },
      { status: 400 }
    );
  }
  if (
    !(await validateReferences(
      id,
      parsed.data.characterId,
      parsed.data.chapterId
    ))
  ) {
    return NextResponse.json(
      { error: '다른 프로젝트의 인물이나 챕터는 연결할 수 없습니다.' },
      { status: 400 }
    );
  }

  const created = await createStoryStateEntry(db, {
    ...parsed.data,
    details: parsed.data.details || null,
    isActive: parsed.data.isActive ? 1 : 0,
    isPinned: parsed.data.isPinned ? 1 : 0,
    previousValue: parsed.data.previousValue || null,
    projectId: id,
  });
  const entries = await listStoryStateEntries(db, id);
  return NextResponse.json(
    entries.find((entry) => entry.id === created?.id) ?? created,
    { status: 201 }
  );
}
