import { and, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import {
  chapters,
  characters,
  storyStateEntries,
  worldEntries,
} from '@/lib/db/schema';

export type StoryStateEntryInput = {
  category: string;
  chapterId?: string | null;
  endChapterId?: string | null;
  characterId?: string | null;
  worldEntryId?: string | null;
  knowledgeScope?: 'canon' | 'reader' | 'character';
  knowerCharacterId?: string | null;
  certainty?: 'known' | 'suspected' | 'believed';
  evidence?: string | null;
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
  const rows = db
    .select()
    .from(storyStateEntries)
    .where(
      options.activeOnly
        ? and(
            eq(storyStateEntries.projectId, projectId),
            eq(storyStateEntries.isActive, 1)
          )
        : eq(storyStateEntries.projectId, projectId)
    )
    .all();
  const [characterRows, chapterRows, worldRows] = await Promise.all([
    Promise.resolve(db.select({ id: characters.id, name: characters.name }).from(characters).where(eq(characters.projectId, projectId)).all()),
    Promise.resolve(db.select({ id: chapters.id, order: chapters.order, title: chapters.title }).from(chapters).where(eq(chapters.projectId, projectId)).all()),
    Promise.resolve(db.select({ id: worldEntries.id, title: worldEntries.title }).from(worldEntries).where(eq(worldEntries.projectId, projectId)).all()),
  ]);
  const charactersById = new Map(characterRows.map(row => [row.id, row.name]));
  const chaptersById = new Map<string, { order: number; title: string }>(
    chapterRows.map(row => [row.id, { order: row.order, title: row.title }])
  );
  const worldsById = new Map(worldRows.map(row => [row.id, row.title]));
  return rows.map(row => ({
    ...row,
    chapterTitle: row.chapterId ? chaptersById.get(row.chapterId)?.title ?? null : null,
    chapterOrder: row.chapterId ? chaptersById.get(row.chapterId)?.order ?? null : null,
    endChapterTitle: row.endChapterId ? chaptersById.get(row.endChapterId)?.title ?? null : null,
    endChapterOrder: row.endChapterId ? chaptersById.get(row.endChapterId)?.order ?? null : null,
    characterName: row.characterId ? charactersById.get(row.characterId) ?? null : null,
    knowerCharacterName: row.knowerCharacterId ? charactersById.get(row.knowerCharacterId) ?? null : null,
    worldEntryTitle: row.worldEntryId ? worldsById.get(row.worldEntryId) ?? null : null,
  })).sort((left, right) => right.isPinned - left.isPinned || right.isActive - left.isActive ||
    new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime());
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
      endChapterId: input.endChapterId ?? null,
      characterId: input.characterId ?? null,
      worldEntryId: input.worldEntryId ?? null,
      knowledgeScope: input.knowledgeScope ?? 'canon',
      knowerCharacterId: input.knowerCharacterId ?? null,
      certainty: input.certainty ?? 'known',
      evidence: input.evidence ?? null,
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
