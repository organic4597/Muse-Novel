import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import {
  createWorldEntry,
  deleteWorldEntry,
  getWorldEntry,
  listWorldEntries,
  updateWorldEntry,
} from '../queries/world-entries';
import { createProject } from '../queries/projects';

describe('World Entry Queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;

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
  });

  afterEach(() => {
    // Ensure clean state
  });

  describe('createWorldEntry', () => {
    it('should create a world entry with required fields', async () => {
      const entry = await createWorldEntry(db, {
        projectId,
        category: '장소',
        title: '마법의 숲',
      });

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.projectId).toBe(projectId);
      expect(entry.category).toBe('장소');
      expect(entry.title).toBe('마법의 숲');
      expect(entry.content).toBeNull();
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a world entry with all fields', async () => {
      const entry = await createWorldEntry(db, {
        projectId,
        category: '마법',
        title: '화염구',
        content: '고대 마법사가 개발한 강력한 공격 마법',
      });

      expect(entry.category).toBe('마법');
      expect(entry.title).toBe('화염구');
      expect(entry.content).toBe('고대 마법사가 개발한 강력한 공격 마법');
    });

    it('should generate a UUID for id', async () => {
      const entry = await createWorldEntry(db, {
        projectId,
        category: '종족',
        title: '엘프',
      });
      expect(entry.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should allow custom category values', async () => {
      const entry = await createWorldEntry(db, {
        projectId,
        category: '음식',
        title: '드래곤 스테이크',
      });

      expect(entry.category).toBe('음식');
    });
  });

  describe('getWorldEntry', () => {
    it('should return a world entry by id', async () => {
      const created = await createWorldEntry(db, {
        projectId,
        category: '장소',
        title: '검색 대상',
      });
      const found = await getWorldEntry(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('검색 대상');
    });

    it('should return undefined for non-existent id', async () => {
      const found = await getWorldEntry(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('listWorldEntries', () => {
    it('should return empty array when no entries exist', async () => {
      const result = await listWorldEntries(db, projectId);
      expect(result).toEqual([]);
    });

    it('should return entries ordered by createdAt DESC', async () => {
      const first = await createWorldEntry(db, {
        projectId,
        category: '장소',
        title: '첫 번째 장소',
      });

      const second = await createWorldEntry(db, {
        projectId,
        category: '마법',
        title: '두 번째 항목',
      });

      // Update second entry's createdAt to be later
      db.update(schema.worldEntries)
        .set({ createdAt: new Date(Date.now() + 1000) })
        .where(eq(schema.worldEntries.id, second.id))
        .run();

      const result = await listWorldEntries(db, projectId);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('두 번째 항목');
      expect(result[1].title).toBe('첫 번째 장소');
    });

    it('should only return entries for the given project', async () => {
      const otherProject = await createProject(db, { title: '다른 소설' });

      await createWorldEntry(db, { projectId, category: '장소', title: '내 항목' });
      await createWorldEntry(db, {
        projectId: otherProject.id,
        category: '장소',
        title: '다른 항목',
      });

      const result = await listWorldEntries(db, projectId);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('내 항목');
    });

    it('should filter by category when provided', async () => {
      await createWorldEntry(db, { projectId, category: '장소', title: '장소 A' });
      await createWorldEntry(db, { projectId, category: '마법', title: '마법 A' });
      await createWorldEntry(db, { projectId, category: '장소', title: '장소 B' });

      const result = await listWorldEntries(db, projectId, { category: '장소' });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.category === '장소')).toBe(true);
    });

    it('should return all entries when no category filter', async () => {
      await createWorldEntry(db, { projectId, category: '장소', title: '장소 A' });
      await createWorldEntry(db, { projectId, category: '마법', title: '마법 A' });

      const result = await listWorldEntries(db, projectId);
      expect(result).toHaveLength(2);
    });
  });

  describe('updateWorldEntry', () => {
    it('should update entry title', async () => {
      const created = await createWorldEntry(db, {
        projectId,
        category: '장소',
        title: '원래 제목',
      });
      const updated = await updateWorldEntry(db, created.id, {
        title: '수정된 제목',
      });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('수정된 제목');
    });

    it('should update multiple fields', async () => {
      const created = await createWorldEntry(db, {
        projectId,
        category: '장소',
        title: '원래',
      });
      const updated = await updateWorldEntry(db, created.id, {
        title: '수정됨',
        category: '마법',
        content: '새로운 내용',
      });

      expect(updated!.title).toBe('수정됨');
      expect(updated!.category).toBe('마법');
      expect(updated!.content).toBe('새로운 내용');
    });

    it('should update the updatedAt timestamp', async () => {
      const created = await createWorldEntry(db, {
        projectId,
        category: '장소',
        title: '시간 테스트',
      });
      const originalUpdatedAt = created.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await updateWorldEntry(db, created.id, {
        title: '수정됨',
      });

      expect(updated!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt!.getTime()
      );
    });

    it('should return undefined for non-existent id', async () => {
      const result = await updateWorldEntry(db, 'non-existent-id', {
        title: '없음',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteWorldEntry', () => {
    it('should delete an existing world entry', async () => {
      const created = await createWorldEntry(db, {
        projectId,
        category: '장소',
        title: '삭제 대상',
      });
      await deleteWorldEntry(db, created.id);

      const found = await getWorldEntry(db, created.id);
      expect(found).toBeUndefined();
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteWorldEntry(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });
  });
});
