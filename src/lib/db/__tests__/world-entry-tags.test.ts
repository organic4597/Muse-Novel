import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../queries/projects';
import { createWorldEntry } from '../queries/world-entries';
import {
  addTag,
  deleteTag,
  listEntriesByTag,
  listTags,
} from '../queries/world-entry-tags';
import * as schema from '../schema';

describe('World Entry Tag Queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;
  let entryId: string;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(async () => {
    sqlite.exec('DELETE FROM world_entry_tags');
    sqlite.exec('DELETE FROM world_entry_links');
    sqlite.exec('DELETE FROM world_entries');
    sqlite.exec('DELETE FROM projects');

    const project = await createProject(db, { title: '테스트 소설' });
    projectId = project.id;

    const entry = await createWorldEntry(db, {
      projectId,
      category: '장소',
      title: '테스트 항목',
    });
    entryId = entry.id;
  });

  afterEach(() => {
    // Ensure clean state
  });

  describe('addTag', () => {
    it('should add a tag to an entry', async () => {
      const tag = await addTag(db, entryId, '중요');

      expect(tag).toBeDefined();
      expect(tag.id).toBeDefined();
      expect(tag.entryId).toBe(entryId);
      expect(tag.tag).toBe('중요');
      expect(tag.createdAt).toBeInstanceOf(Date);
    });

    it('should generate a UUID for id', async () => {
      const tag = await addTag(db, entryId, '마법');
      expect(tag.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should allow duplicate tags on same entry', async () => {
      await addTag(db, entryId, '중요');
      const tag2 = await addTag(db, entryId, '중요');
      expect(tag2).toBeDefined();
    });
  });

  describe('listTags', () => {
    it('should return empty array when no tags exist', async () => {
      const result = await listTags(db, entryId);
      expect(result).toEqual([]);
    });

    it('should return all tags for an entry', async () => {
      await addTag(db, entryId, '마법');
      await addTag(db, entryId, '중요');
      await addTag(db, entryId, '위험');

      const result = await listTags(db, entryId);
      expect(result).toHaveLength(3);
      expect(result.map((t) => t.tag).sort()).toEqual(['마법', '위험', '중요']);
    });

    it('should only return tags for the given entry', async () => {
      const otherEntry = await createWorldEntry(db, {
        projectId,
        category: '마법',
        title: '다른 항목',
      });

      await addTag(db, entryId, '태그A');
      await addTag(db, otherEntry.id, '태그B');

      const result = await listTags(db, entryId);
      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('태그A');
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag by id', async () => {
      const tag = await addTag(db, entryId, '삭제할 태그');
      await deleteTag(db, tag.id);

      const result = await listTags(db, entryId);
      expect(result).toHaveLength(0);
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteTag(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });
  });

  describe('listEntriesByTag', () => {
    it('should return entries matching a tag within a project', async () => {
      const entry2 = await createWorldEntry(db, {
        projectId,
        category: '마법',
        title: '두 번째 항목',
      });

      await addTag(db, entryId, '공통태그');
      await addTag(db, entry2.id, '공통태그');
      await addTag(db, entry2.id, '다른태그');

      const result = await listEntriesByTag(db, projectId, '공통태그');
      expect(result).toHaveLength(2);
    });

    it('should not return entries from other projects', async () => {
      const otherProject = await createProject(db, { title: '다른 소설' });
      const otherEntry = await createWorldEntry(db, {
        projectId: otherProject.id,
        category: '장소',
        title: '다른 프로젝트 항목',
      });

      await addTag(db, entryId, '공유태그');
      await addTag(db, otherEntry.id, '공유태그');

      const result = await listEntriesByTag(db, projectId, '공유태그');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('테스트 항목');
    });

    it('should return empty array when no entries match', async () => {
      const result = await listEntriesByTag(db, projectId, '존재하지않는태그');
      expect(result).toEqual([]);
    });
  });
});
