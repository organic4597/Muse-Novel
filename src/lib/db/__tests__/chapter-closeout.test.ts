import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../schema';
import { applyChapterCloseout } from '../queries/chapter-closeout';
import { chapterSnapshotHash } from '@/lib/ai/chapter-closeout';

describe('chapter closeout application', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  beforeEach(() => {
    sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema }); migrate(db, { migrationsFolder: './drizzle' });
    db.insert(schema.projects).values({ id: 'p', title: '무협' }).run();
    db.insert(schema.chapters).values({ id: 'c', projectId: 'p', title: '제 1장', order: 0 }).run();
    db.insert(schema.characters).values({ id: 'hero', projectId: 'p', name: '검은 토끼' }).run();
    db.insert(schema.storyStateEntries).values({ id: 'old', projectId: 'p', characterId: 'hero', category: '소지품', label: '공청석유', value: '보유' }).run();
  });
  afterEach(() => sqlite.close());

  it('applies approved state, time and plot candidates once in one transaction', () => {
    const input = {
      snapshotHash: chapterSnapshotHash('[{"type":"p","children":[{"text":"복용했다."}]}]'),
      storyDate: { storyYear: 138, storyMonth: 4, storyDay: 12, storyTimeLabel: null, storyDatePrecision: 'day' as const, storyDateLabel: null, evidence: '복용했다.' },
      states: [{ id: crypto.randomUUID(), category: '소지품' as const, subjectType: 'character' as const, subjectName: '검은 토끼', characterId: 'hero', worldEntryId: null,
        knowledgeScope: 'canon' as const, knowerName: null, knowerCharacterId: null, certainty: 'known' as const, label: '공청석유', previousValue: null, value: '복용 완료', details: null, evidence: '복용했다.', warning: null }],
      plotNodes: [{ id: crypto.randomUUID(), nodeKind: 'consequence' as const, title: '공청석유 복용', description: '토끼가 영약을 복용했다.', lane: '공청석유', evidence: '복용했다.' }],
    };
    const applied = applyChapterCloseout(db, 'p', 'c', input);
    expect(applied.stateIds).toHaveLength(1); expect(applied.plotNodeIds).toHaveLength(1);
    expect(db.select().from(schema.storyStateEntries).all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'old', isActive: 0, endChapterId: 'c' }),
      expect.objectContaining({ characterId: 'hero', previousValue: '보유', value: '복용 완료' }),
    ]));
    expect(db.select().from(schema.chapters).get()).toMatchObject({ storyYear: 138, storyMonth: 4, storyDay: 12 });
    expect(() => applyChapterCloseout(db, 'p', 'c', input)).toThrow('CLOSEOUT_ALREADY_APPLIED');
  });
});
