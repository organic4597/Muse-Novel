import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DB } from '@/lib/db';
import { getWorldCategoryOptions } from '@/lib/world-categories';
import { createProject, deleteProject } from '../queries/projects';
import { createWorldCategory, deleteWorldCategory, listWorldCategories, renameWorldCategory } from '../queries/world-categories';
import { createWorldEntry, getWorldEntry, updateWorldEntry } from '../queries/world-entries';
import { listPendingWorldSuggestions, saveWorldSuggestions } from '../queries/world-suggestions';
import * as schema from '../schema';

describe('persistent project world categories', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: DB;
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });
  afterEach(() => sqlite.close());

  it('retains empty categories, deduplicates repeated requests and isolates projects', async () => {
    const first = await createProject(db, { title: '첫 작품' });
    const second = await createProject(db, { title: '다른 작품' });
    await createWorldCategory(db, first.id, '영약');
    await createWorldCategory(db, first.id, '영약');
    expect(await listWorldCategories(db, first.id)).toEqual([
      expect.objectContaining({ name: '영약', projectId: first.id }),
    ]);
    expect(await listWorldCategories(db, second.id)).toEqual([]);
    await createWorldCategory(db, second.id, '영약');
    expect(await listWorldCategories(db, second.id)).toHaveLength(1);
  });

  it('removes only the deleted project’s saved categories', async () => {
    const first = await createProject(db, { title: '삭제 작품' });
    const second = await createProject(db, { title: '보존 작품' });
    await createWorldCategory(db, first.id, '영약');
    await createWorldCategory(db, second.id, '무기');
    await deleteProject(db, first.id);
    expect(await listWorldCategories(db, first.id)).toEqual([]);
    expect(await listWorldCategories(db, second.id)).toHaveLength(1);
  });

  it('renames a default category, moves canon and pending drafts, and keeps other projects unchanged', async () => {
    const first = await createProject(db, { title: '첫 작품' });
    const second = await createProject(db, { title: '다른 작품' });
    const entry = await createWorldEntry(db, { projectId: first.id, title: '성', category: '장소', content: '보존할 본문' });
    const other = await createWorldEntry(db, { projectId: second.id, title: '도시', category: '장소' });
    await saveWorldSuggestions(db, first.id, [{ title: '마을', category: '장소' }]);
    const result = await renameWorldCategory(db, first.id, '장소', '지역');
    expect(result).toMatchObject({ name: '지역', updatedEntries: 1, updatedSuggestions: 1 });
    expect(await getWorldEntry(db, entry.id)).toMatchObject({ category: '지역', content: '보존할 본문' });
    expect(await getWorldEntry(db, other.id)).toMatchObject({ category: '장소' });
    expect((await listPendingWorldSuggestions(db, first.id))[0].category).toBe('지역');
    const restored = getWorldCategoryOptions(await listWorldCategories(db, first.id));
    expect(restored).toContain('지역');
    expect(restored).not.toContain('장소');
  });

  it('preserves empty custom categories and follows rename history in stale saves', async () => {
    const project = await createProject(db, { title: '작품' });
    await createWorldCategory(db, project.id, '영약');
    await renameWorldCategory(db, project.id, '영약', '약재');
    await renameWorldCategory(db, project.id, '약재', '약물');
    const entry = await createWorldEntry(db, { projectId: project.id, title: '약', category: '영약' });
    expect(entry.category).toBe('약물');
    expect((await updateWorldEntry(db, entry.id, { category: '약재' })).category).toBe('약물');
    expect((await saveWorldSuggestions(db, project.id, [{ title: '다른 약', category: '영약' }]))[0].category).toBe('약물');
    expect(await createWorldCategory(db, project.id, '영약')).toBe('약물');
    expect(await listWorldCategories(db, project.id)).toHaveLength(1);
  });

  it('rejects collisions and stale renames without silently merging categories', async () => {
    const project = await createProject(db, { title: '작품' });
    await createWorldCategory(db, project.id, '영약');
    await expect(renameWorldCategory(db, project.id, '영약', '물건')).rejects.toThrow('이미 사용 중');
    await renameWorldCategory(db, project.id, '영약', '약재');
    await expect(renameWorldCategory(db, project.id, '영약', '다른 이름')).rejects.toThrow('이미 이름이 변경');
    await expect(renameWorldCategory(db, project.id, '없는 분류', '다른 이름')).rejects.toThrow('찾을 수 없습니다');
    expect(await renameWorldCategory(db, project.id, '영약', '약재')).toMatchObject({ name: '약재', updatedEntries: 0 });
  });

  it('allows restoring the original default name', async () => {
    const project = await createProject(db, { title: '작품' });
    await renameWorldCategory(db, project.id, '장소', '지역');
    await renameWorldCategory(db, project.id, '지역', '장소');
    const options = getWorldCategoryOptions(await listWorldCategories(db, project.id));
    expect(options.filter((name) => name === '장소')).toHaveLength(1);
    expect(options).not.toContain('지역');
  });

  it('deletes a category without deleting its entries, tags, links or pending suggestions', async () => {
    const project = await createProject(db, { title: '작품' });
    const other = await createProject(db, { title: '다른 작품' });
    const entry = await createWorldEntry(db, { projectId: project.id, title: '성', category: '장소', content: '보존할 내용' });
    const related = await createWorldEntry(db, { projectId: project.id, title: '유물', category: '물건' });
    const untouched = await createWorldEntry(db, { projectId: other.id, title: '도시', category: '장소' });
    sqlite.prepare('INSERT INTO world_entry_tags(id,entry_id,tag) VALUES(?,?,?)').run('tag', entry.id, '왕국');
    sqlite.prepare('INSERT INTO world_entry_links(id,source_id,target_id) VALUES(?,?,?)').run('link', entry.id, related.id);
    await saveWorldSuggestions(db, project.id, [{ title: '마을', category: '장소' }]);
    const result = await deleteWorldCategory(db, project.id, '장소', '기타');
    expect(result).toMatchObject({ targetName: '기타', updatedEntries: 1, updatedSuggestions: 1 });
    expect(await getWorldEntry(db, entry.id)).toMatchObject({ category: '기타', content: '보존할 내용' });
    expect((await getWorldEntry(db, untouched.id)).category).toBe('장소');
    expect(sqlite.prepare('SELECT count(*) AS n FROM world_entry_tags').get()).toEqual({ n: 1 });
    expect(sqlite.prepare('SELECT count(*) AS n FROM world_entry_links').get()).toEqual({ n: 1 });
    expect((await listPendingWorldSuggestions(db, project.id))[0]).toMatchObject({ category: '기타', status: 'pending' });
    expect(getWorldCategoryOptions(await listWorldCategories(db, project.id))).not.toContain('장소');
  });

  it('transfers rename history and routes later stale saves to the destination', async () => {
    const project = await createProject(db, { title: '작품' });
    await createWorldCategory(db, project.id, '영약');
    await renameWorldCategory(db, project.id, '영약', '약재');
    await deleteWorldCategory(db, project.id, '약재', '물건');
    const records = await listWorldCategories(db, project.id);
    expect(records.map(({ name }) => name)).toEqual(['물건']);
    expect(getWorldCategoryOptions(records)).not.toContain('약재');
    expect((await createWorldEntry(db, { projectId: project.id, title: '약', category: '영약' })).category).toBe('물건');
    expect(await deleteWorldCategory(db, project.id, '약재', '물건')).toMatchObject({ updatedEntries: 0 });
  });

  it('rejects invalid destinations and protects the last category', async () => {
    const project = await createProject(db, { title: '작품' });
    await expect(deleteWorldCategory(db, project.id, '장소', '장소')).rejects.toThrow('달라야');
    await expect(deleteWorldCategory(db, project.id, '장소', '없는 분류')).rejects.toThrow('다른 카테고리');
    await expect(deleteWorldCategory(db, project.id, '없는 분류', '기타')).rejects.toThrow('찾을 수 없습니다');
    for (const category of getWorldCategoryOptions([]).filter((name) => name !== '기타')) {
      await deleteWorldCategory(db, project.id, category, '기타');
    }
    expect(getWorldCategoryOptions(await listWorldCategories(db, project.id))).toEqual(['기타']);
    await expect(deleteWorldCategory(db, project.id, '기타', '장소')).rejects.toThrow('마지막 카테고리');
  });

  it('rolls back the entire deletion when moving a candidate fails', async () => {
    const project = await createProject(db, { title: '작품' });
    await createWorldCategory(db, project.id, '지역');
    const entry = await createWorldEntry(db, { projectId: project.id, title: '성', category: '지역' });
    await saveWorldSuggestions(db, project.id, [{ title: '마을', category: '지역' }]);
    sqlite.exec("CREATE TRIGGER fail_delete_move BEFORE UPDATE ON world_entry_suggestions BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await expect(deleteWorldCategory(db, project.id, '지역', '기타')).rejects.toThrow();
    expect((await getWorldEntry(db, entry.id)).category).toBe('지역');
    expect((await listWorldCategories(db, project.id)).map(({ name }) => name)).toEqual(['지역']);
  });

  it('rolls back the category and canon if moving drafts fails', async () => {
    const project = await createProject(db, { title: '작품' });
    const entry = await createWorldEntry(db, { projectId: project.id, title: '성', category: '장소' });
    await saveWorldSuggestions(db, project.id, [{ title: '마을', category: '장소' }]);
    sqlite.exec("CREATE TRIGGER fail_rename BEFORE UPDATE ON world_entry_suggestions BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    await expect(renameWorldCategory(db, project.id, '장소', '지역')).rejects.toThrow();
    expect((await getWorldEntry(db, entry.id)).category).toBe('장소');
    expect(await listWorldCategories(db, project.id)).toEqual([]);
  });
});
