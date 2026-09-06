import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/lib/db';
import { getChapterReferences, saveChapterReferences } from '@/lib/db/queries/chapter-references';
import { createChapter, deleteChapter } from '@/lib/db/queries/chapters';
import { createAffiliationEvent, deleteAffiliationEvent, getCharacterAffiliations, updateAffiliationEvent } from '@/lib/db/queries/character-affiliations';
import { createCharacter } from '@/lib/db/queries/characters';
import { createProject } from '@/lib/db/queries/projects';
import { createWorldCategory, listWorldCategories, renameWorldCategory, setWorldCategoryTraits } from '@/lib/db/queries/world-categories';
import { createWorldEntry } from '@/lib/db/queries/world-entries';
import * as schema from '@/lib/db/schema';

describe('character affiliations and chapter references', () => {
  let sqlite: InstanceType<typeof Database>; let db: DB; let projectId: string;
  let characterId: string; let firstId: string; let secondId: string; let organizationId: string; let placeId: string;
  beforeEach(async () => {
    sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON'); db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
    projectId = (await createProject(db, { title: '회차 정전 테스트' })).id;
    firstId = (await createChapter(db, { projectId, title: '가입', order: 0 })).id;
    secondId = (await createChapter(db, { projectId, title: '승진', order: 1 })).id;
    characterId = (await createCharacter(db, { projectId, name: '검은 토끼' })).id;
    await createWorldCategory(db, projectId, '종파'); await createWorldCategory(db, projectId, '지역');
    const categories = await listWorldCategories(db, projectId);
    await setWorldCategoryTraits(db, projectId, categories.find((entry) => entry.name === '종파')!.id, ['organization']);
    await setWorldCategoryTraits(db, projectId, categories.find((entry) => entry.name === '지역')!.id, ['location']);
    organizationId = (await createWorldEntry(db, { projectId, title: '소림사', category: '종파' })).id;
    placeId = (await createWorldEntry(db, { projectId, title: '숭산', category: '지역' })).id;
  });
  afterEach(() => sqlite.close());

  it('resolves initial, chapter-start and chapter-end affiliation snapshots without leaking future ranks', async () => {
    await createAffiliationEvent(db, projectId, characterId, { expectedRevision: 0, chapterId: null, boundary: 'initial', reason: '초기', memberships: [] });
    await createAffiliationEvent(db, projectId, characterId, { expectedRevision: 1, chapterId: firstId, boundary: 'chapter_start', reason: '입문', memberships: [{ organizationEntryId: organizationId, position: '객원', isPrimary: true }] });
    await createAffiliationEvent(db, projectId, characterId, { expectedRevision: 2, chapterId: secondId, boundary: 'chapter_end', reason: '공로', memberships: [{ organizationEntryId: organizationId, position: '명예장로', isPrimary: true }] });
    expect((await getCharacterAffiliations(db, projectId, characterId, { chapterId: firstId })).current?.memberships[0]?.position).toBe('객원');
    const secondStart = await getCharacterAffiliations(db, projectId, characterId, { chapterId: secondId, boundary: 'start' });
    expect(secondStart.current?.memberships[0]?.position).toBe('객원');
    expect(secondStart.upcoming?.memberships[0]?.position).toBe('명예장로');
    expect((await getCharacterAffiliations(db, projectId, characterId, { chapterId: secondId, boundary: 'end' })).current?.memberships[0]?.position).toBe('명예장로');
  });

  it('accepts only organization-trait entries and preserves the trait through category rename', async () => {
    await expect(createAffiliationEvent(db, projectId, characterId, { expectedRevision: 0, chapterId: null, boundary: 'initial', memberships: [{ organizationEntryId: placeId, position: null, isPrimary: true }] })).rejects.toThrow('단체 특성');
    await renameWorldCategory(db, projectId, '종파', '문파');
    const state = await getCharacterAffiliations(db, projectId, characterId);
    expect(state.organizationOptions.map((entry) => entry.title)).toEqual(['소림사']);
  });

  it('uses optimistic revisions and keeps a deleted chapter event as unplaced history', async () => {
    const created = await createAffiliationEvent(db, projectId, characterId, { expectedRevision: 0, chapterId: firstId, boundary: 'chapter_start', memberships: [{ organizationEntryId: organizationId, position: '객원', isPrimary: true }] });
    await expect(createAffiliationEvent(db, projectId, characterId, { expectedRevision: 0, chapterId: secondId, boundary: 'chapter_start', memberships: [] })).rejects.toThrow('다른 화면');
    await updateAffiliationEvent(db, { projectId, characterId, eventId: created.id }, { expectedRevision: 1, chapterId: firstId, boundary: 'chapter_start', reason: '직위 정정', memberships: [{ organizationEntryId: organizationId, position: '속가제자', isPrimary: true }] });
    expect((await getCharacterAffiliations(db, projectId, characterId)).current?.memberships[0]?.position).toBe('속가제자');
    await deleteChapter(db, firstId);
    expect((await getCharacterAffiliations(db, projectId, characterId)).events.find((entry) => entry.id === created.id)).toMatchObject({ boundary: 'unplaced', chapterTitle: '가입' });
    await deleteAffiliationEvent(db, { projectId, characterId, eventId: created.id, expectedRevision: 2 });
    expect((await getCharacterAffiliations(db, projectId, characterId)).events).toEqual([]);
  });

  it('stores direct and mentioned chapter references with category-trait groups and affiliation summaries', async () => {
    await createAffiliationEvent(db, projectId, characterId, { expectedRevision: 0, chapterId: null, boundary: 'initial', memberships: [{ organizationEntryId: organizationId, position: '제자', isPrimary: true }] });
    const saved = await saveChapterReferences(db, projectId, firstId, { expectedRevision: 0, references: [
      { characterId, worldEntryId: null, presence: 'appears', displayGroupOverride: null, note: null, sortOrder: 0 },
      { characterId: null, worldEntryId: placeId, presence: 'mentioned', displayGroupOverride: null, note: '목적지', sortOrder: 1 },
    ] });
    expect(saved.revision).toBe(1);
    expect(saved.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '검은 토끼', group: 'character', presence: 'appears', affiliations: [expect.objectContaining({ organizationTitle: '소림사', position: '제자' })] }),
      expect.objectContaining({ title: '숭산', group: 'location', presence: 'mentioned' }),
    ]));
    await expect(saveChapterReferences(db, projectId, firstId, { expectedRevision: 0, references: [] })).rejects.toThrow('다른 화면');
    expect((await getChapterReferences(db, projectId, firstId)).references).toHaveLength(2);
  });
});
