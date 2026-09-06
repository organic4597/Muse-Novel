import { and, desc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import {
  chapters,
  characters,
  storyStateEntries,
} from '@/lib/db/schema';

export type StoryStateEntryInput = {
  category: string;
  chapterId?: string | null;
  characterId?: string | null;
  details?: string | null;
  isActive?: number;
  isPinned?: number;
  label: string;
  previousValue?: string | null;
  projectId: string;
  value: string;
};

export type StoryStateEntryUpdate = Partial<
  Omit<StoryStateEntryInput, 'projectId'>
>;

export async function listStoryStateEntries(
  db: DB,
  projectId: string,
  options: { activeOnly?: boolean } = {}
) {
  return db
    .select({
      category: storyStateEntries.category,
      chapterId: storyStateEntries.chapterId,
      chapterTitle: chapters.title,
      characterId: storyStateEntries.characterId,
      characterName: characters.name,
      createdAt: storyStateEntries.createdAt,
      details: storyStateEntries.details,
      id: storyStateEntries.id,
      isActive: storyStateEntries.isActive,
      isPinned: storyStateEntries.isPinned,
      label: storyStateEntries.label,
      previousValue: storyStateEntries.previousValue,
      projectId: storyStateEntries.projectId,
      updatedAt: storyStateEntries.updatedAt,
      value: storyStateEntries.value,
    })
    .from(storyStateEntries)
    .leftJoin(characters, eq(storyStateEntries.characterId, characters.id))
    .leftJoin(chapters, eq(storyStateEntries.chapterId, chapters.id))
    .where(
      options.activeOnly
        ? and(
            eq(storyStateEntries.projectId, projectId),
            eq(storyStateEntries.isActive, 1)
          )
        : eq(storyStateEntries.projectId, projectId)
    )
    .orderBy(
      desc(storyStateEntries.isPinned),
      desc(storyStateEntries.isActive),
      desc(storyStateEntries.updatedAt)
    )
    .all();
}

export async function getStoryStateEntry(db: DB, id: string) {
  const rows = await db
    .select()
    .from(storyStateEntries)
    .where(eq(storyStateEntries.id, id))
    .limit(1)
    .all();
  return rows[0];
}

export async function createStoryStateEntry(
  db: DB,
  input: StoryStateEntryInput
) {
  const rows = await db
    .insert(storyStateEntries)
    .values({
      ...input,
      chapterId: input.chapterId ?? null,
      characterId: input.characterId ?? null,
      details: input.details ?? null,
      isActive: input.isActive ?? 1,
      isPinned: input.isPinned ?? 0,
      previousValue: input.previousValue ?? null,
    })
    .returning()
    .all();
  return rows[0];
}

export async function updateStoryStateEntry(
  db: DB,
  id: string,
  input: StoryStateEntryUpdate
) {
  const rows = await db
    .update(storyStateEntries)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(storyStateEntries.id, id))
    .returning()
    .all();
  return rows[0];
}

export async function deleteStoryStateEntry(db: DB, id: string) {
  await Promise.resolve(
    db.delete(storyStateEntries).where(eq(storyStateEntries.id, id)).run()
  );
}
