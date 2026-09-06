import { and, asc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { type ChapterReferenceGroup, chapterReferencesSaveSchema } from '@/lib/chapter-references';
import type { DB } from '@/lib/db';
import { chapterEntityReferences, chapterReferenceVersions, chapters, characters, worldEntries } from '@/lib/db/schema';
import { worldCategoryAliases } from '@/lib/world-categories';
import { getAffiliationSummariesAt } from './character-affiliations';
import { listWorldCategories } from './world-categories';

export class ChapterReferenceError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

type SaveInput = z.infer<typeof chapterReferencesSaveSchema>;
function groupsFor(category: string, categories: Awaited<ReturnType<typeof listWorldCategories>>): ChapterReferenceGroup[] {
  const match = categories.find((record) => [record.name, ...worldCategoryAliases(record)]
    .some((name) => name.normalize('NFKC').trim().toLocaleLowerCase('ko-KR') === category.normalize('NFKC').trim().toLocaleLowerCase('ko-KR')));
  const groups: ChapterReferenceGroup[] = [];
  if (match?.traits.includes('location')) groups.push('location');
  if (match?.traits.includes('item')) groups.push('item');
  if (match?.traits.includes('organization')) groups.push('organization');
  return groups.length ? groups : ['other'];
}

function groupFor(category: string, categories: Awaited<ReturnType<typeof listWorldCategories>>): ChapterReferenceGroup {
  return groupsFor(category, categories)[0] ?? 'other';
}

export async function getChapterReferences(db: DB, projectId: string, chapterId: string) {
  const chapter = db.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.id, chapterId))).get();
  if (!chapter) throw new ChapterReferenceError('이 작품의 회차를 찾을 수 없습니다.', 404);
  const [rows, characterOptions, worldOptions, categories] = await Promise.all([
    db.select().from(chapterEntityReferences).where(and(eq(chapterEntityReferences.projectId, projectId), eq(chapterEntityReferences.chapterId, chapterId)))
      .orderBy(asc(chapterEntityReferences.sortOrder)).all(),
    db.select({ id: characters.id, name: characters.name }).from(characters).where(eq(characters.projectId, projectId)).orderBy(asc(characters.name)).all(),
    db.select({ id: worldEntries.id, title: worldEntries.title, category: worldEntries.category }).from(worldEntries).where(eq(worldEntries.projectId, projectId)).orderBy(asc(worldEntries.title)).all(),
    listWorldCategories(db, projectId),
  ]);
  const charactersById = new Map<string, { id: string; name: string }>(characterOptions.map((entry) => [entry.id, entry]));
  const worldsById = new Map<string, { id: string; title: string; category: string }>(worldOptions.map((entry) => [entry.id, entry]));
  const affiliations = getAffiliationSummariesAt(db, projectId, rows.flatMap((row) => row.characterId ? [row.characterId] : []), chapterId);
  const revision = db.select({ revision: chapterReferenceVersions.revision }).from(chapterReferenceVersions)
    .where(eq(chapterReferenceVersions.chapterId, chapterId)).get()?.revision ?? 0;
  return {
    chapterId, revision,
    references: rows.map((row) => {
      const character = row.characterId ? charactersById.get(row.characterId) : null;
      const world = row.worldEntryId ? worldsById.get(row.worldEntryId) : null;
      return { ...row, title: character?.name ?? world?.title ?? '삭제된 항목', category: world?.category ?? null,
        affiliations: row.characterId ? affiliations.get(row.characterId) ?? [] : [],
        group: row.displayGroupOverride ?? (character ? 'character' : world ? groupFor(world.category, categories) : 'other'),
      };
    }),
    options: {
      characters: characterOptions.map((entry) => ({ ...entry, group: 'character' as const })),
      worldEntries: worldOptions.map((entry) => ({ ...entry, group: groupFor(entry.category, categories), groups: groupsFor(entry.category, categories) })),
    },
  };
}

export async function saveChapterReferences(db: DB, projectId: string, chapterId: string, input: SaveInput) {
  db.transaction((tx: DB) => {
    const chapter = tx.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.id, chapterId))).get();
    if (!chapter) throw new ChapterReferenceError('이 작품의 회차를 찾을 수 없습니다.', 404);
    const revision = tx.select({ revision: chapterReferenceVersions.revision }).from(chapterReferenceVersions)
      .where(eq(chapterReferenceVersions.chapterId, chapterId)).get()?.revision ?? 0;
    if (revision !== input.expectedRevision) throw new ChapterReferenceError('등장 항목이 다른 화면에서 변경되었습니다. 최신 목록을 다시 확인해주세요.');
    const characterIds = input.references.flatMap((entry) => entry.characterId ? [entry.characterId] : []);
    const worldIds = input.references.flatMap((entry) => entry.worldEntryId ? [entry.worldEntryId] : []);
    const validCharacters = characterIds.length ? tx.select({ id: characters.id }).from(characters)
      .where(and(eq(characters.projectId, projectId), inArray(characters.id, characterIds))).all() : [];
    const validWorlds = worldIds.length ? tx.select({ id: worldEntries.id }).from(worldEntries)
      .where(and(eq(worldEntries.projectId, projectId), inArray(worldEntries.id, worldIds))).all() : [];
    if (new Set(validCharacters.map((entry) => entry.id)).size !== new Set(characterIds).size ||
      new Set(validWorlds.map((entry) => entry.id)).size !== new Set(worldIds).size) {
      throw new ChapterReferenceError('다른 작품이거나 삭제된 항목은 연결할 수 없습니다.', 400);
    }
    tx.delete(chapterEntityReferences).where(and(eq(chapterEntityReferences.projectId, projectId), eq(chapterEntityReferences.chapterId, chapterId))).run();
    for (const entry of input.references) tx.insert(chapterEntityReferences).values({
      projectId, chapterId, characterId: entry.characterId ?? null, worldEntryId: entry.worldEntryId ?? null,
      presence: entry.presence, displayGroupOverride: entry.displayGroupOverride ?? null,
      note: entry.note ?? null, sortOrder: entry.sortOrder,
    }).run();
    tx.insert(chapterReferenceVersions).values({ projectId, chapterId, revision: revision + 1 })
      .onConflictDoUpdate({ target: chapterReferenceVersions.chapterId, set: { revision: revision + 1 } }).run();
  }, { behavior: 'immediate' });
  return getChapterReferences(db, projectId, chapterId);
}
