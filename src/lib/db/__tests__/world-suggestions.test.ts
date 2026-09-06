import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DB } from '@/lib/db';
import { collectProjectMemorySources } from '@/lib/memory/project-memory';
import { createProject } from '../queries/projects';
import { createWorldEntry, listWorldEntriesWithTags } from '../queries/world-entries';
import { listPendingWorldSuggestions, reviewWorldSuggestions, saveWorldSuggestions } from '../queries/world-suggestions';
import * as schema from '../schema';

describe('world suggestion approval boundary', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: DB;
  let projectId: string;
  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
    projectId = (await createProject(db, { title: '검토 테스트' })).id;
  });
  afterEach(() => sqlite.close());

  const inputs = [
    { title: '공청석유', category: '영약', content: '후보 설명과 출처', tags: ['영약', '무협'] },
    { title: '천년설삼', category: '영약', content: '두 번째 후보', tags: ['영약'] },
  ];

  it('persists pending drafts while keeping them out of world entries and AI memory', async () => {
    await saveWorldSuggestions(db, projectId, inputs);
    expect(await listPendingWorldSuggestions(db, projectId)).toHaveLength(2);
    expect(await listWorldEntriesWithTags(db, projectId)).toEqual([]);
    const sources = await collectProjectMemorySources(db, projectId);
    expect(sources.some((source) => source.content.includes('공청석유'))).toBe(false);
  });

  it('approves only selected drafts and makes retries idempotent', async () => {
    const pending = await saveWorldSuggestions(db, projectId, inputs);
    const first = await reviewWorldSuggestions(db, projectId, [pending[0].id], 'approve');
    const retry = await reviewWorldSuggestions(db, projectId, [pending[0].id], 'approve');
    const entries = await listWorldEntriesWithTags(db, projectId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: '공청석유', content: '후보 설명과 출처' });
    expect(entries[0].tags.map(({ tag }) => tag).sort()).toEqual(['무협', '영약']);
    expect(retry.entries[0].id).toBe(first.entries[0].id);
    expect(await listPendingWorldSuggestions(db, projectId)).toHaveLength(1);
    expect((await collectProjectMemorySources(db, projectId)).some((source) => source.content.includes('공청석유'))).toBe(true);
  });

  it('rejects without writing canon and refuses an opposite later decision', async () => {
    const pending = await saveWorldSuggestions(db, projectId, inputs);
    await reviewWorldSuggestions(db, projectId, [pending[0].id], 'reject');
    await reviewWorldSuggestions(db, projectId, [pending[0].id], 'reject');
    expect(await listWorldEntriesWithTags(db, projectId)).toEqual([]);
    await expect(reviewWorldSuggestions(db, projectId, [pending[0].id], 'approve')).rejects.toThrow('반대 결정');
  });

  it('persists coverage for reload and approves only item-specific sources separately from content', async () => {
    const research = { status: 'searched' as const, queries: ['영약'], sources: [
      { id: '웹1', title: '공청석유', url: 'https://example.org/medicine', snippet: '가상 영약' },
      { id: '웹2', title: '다른 설정', url: 'https://example.org/other', snippet: '관련 없는 자료' },
    ] };
    const report = { instruction: '영약 두 개', requestedCount: 2, expectedTitles: ['공청석유', '천년설삼'],
      existingTitles: [], pendingTitles: [], generatedCount: 1, missingTitles: ['천년설삼'], warnings: [], diagnostics: [] };
    const pending = await saveWorldSuggestions(db, projectId, [{ ...inputs[0], sourceIds: ['웹1'] }], { research, report });
    const restored = await listPendingWorldSuggestions(db, projectId);
    expect(restored[0].report).toEqual(report);
    await reviewWorldSuggestions(db, projectId, [pending[0].id], 'approve');
    const [entry] = await listWorldEntriesWithTags(db, projectId);
    expect(entry.content).toBe(inputs[0].content);
    expect(JSON.parse(entry.researchJson!).sources.map((source: { id: string }) => source.id)).toEqual(['웹1']);
  });

  it('cannot approve another project’s draft', async () => {
    const pending = await saveWorldSuggestions(db, projectId, inputs);
    const other = await createProject(db, { title: '다른 작품' });
    await expect(reviewWorldSuggestions(db, other.id, [pending[0].id], 'approve')).rejects.toThrow('검토 후보');
    expect(await listWorldEntriesWithTags(db, projectId)).toEqual([]);
  });

  it('rolls back a whole approval batch if a newly created title conflicts', async () => {
    const pending = await saveWorldSuggestions(db, projectId, inputs);
    await createWorldEntry(db, { projectId, category: '영약', title: '천년설삼', content: '작가가 직접 추가' });
    await expect(reviewWorldSuggestions(db, projectId, pending.map((entry) => entry.id), 'approve')).rejects.toThrow('이미 있습니다');
    expect(await listPendingWorldSuggestions(db, projectId)).toHaveLength(2);
    const entries = await listWorldEntriesWithTags(db, projectId);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('작가가 직접 추가');
  });

  it('does not leave a half-saved entry when saving tags fails', async () => {
    const pending = await saveWorldSuggestions(db, projectId, inputs);
    sqlite.exec("CREATE TRIGGER fail_test_tag BEFORE INSERT ON world_entry_tags BEGIN SELECT RAISE(ABORT, 'test tag failure'); END");
    await expect(reviewWorldSuggestions(db, projectId, [pending[0].id], 'approve')).rejects.toThrow();
    expect(await listWorldEntriesWithTags(db, projectId)).toEqual([]);
    expect(await listPendingWorldSuggestions(db, projectId)).toHaveLength(2);
  });
});
