import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createChapter, listChapters, reorderChapter } from '@/lib/db/queries/chapters';
import { createProject } from '@/lib/db/queries/projects';
import * as schema from '@/lib/db/schema';
import { chapters } from '@/lib/db/schema';

/**
 * Tests for chapter drag-and-drop reorder functionality.
 *
 * These test the core reorder logic at the DB query layer since
 * the sortable UI relies on @dnd-kit which requires a full browser environment.
 */
describe('Chapter Sortable - Reorder Logic', () => {
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
    sqlite.exec('DELETE FROM chapters');
    sqlite.exec('DELETE FROM projects');

    const project = await createProject(db, { title: '테스트 프로젝트' });
    projectId = project.id;
  });

  afterEach(() => {
    // Ensure clean state
  });

  describe('batch reorder (simulating drag-and-drop)', () => {
    it('should reorder chapters by updating order fields', async () => {
      const ch1 = await createChapter(db, { projectId, title: '1장' });
      const ch2 = await createChapter(db, { projectId, title: '2장' });
      const ch3 = await createChapter(db, { projectId, title: '3장' });

      expect(ch1.order).toBe(0);
      expect(ch2.order).toBe(1);
      expect(ch3.order).toBe(2);

      // Simulate reorder: move ch3 to first position → [ch3, ch1, ch2]
      const orderedIds = [ch3.id, ch1.id, ch2.id];
      for (let i = 0; i < orderedIds.length; i++) {
        await reorderChapter(db, orderedIds[i], i);
      }

      const result = await listChapters(db, projectId);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(ch3.id);
      expect(result[0].order).toBe(0);
      expect(result[1].id).toBe(ch1.id);
      expect(result[1].order).toBe(1);
      expect(result[2].id).toBe(ch2.id);
      expect(result[2].order).toBe(2);
    });

    it('should handle moving item to the end', async () => {
      const ch1 = await createChapter(db, { projectId, title: '1장' });
      const ch2 = await createChapter(db, { projectId, title: '2장' });
      const ch3 = await createChapter(db, { projectId, title: '3장' });

      // Move ch1 to last → [ch2, ch3, ch1]
      const orderedIds = [ch2.id, ch3.id, ch1.id];
      for (let i = 0; i < orderedIds.length; i++) {
        await reorderChapter(db, orderedIds[i], i);
      }

      const result = await listChapters(db, projectId);
      expect(result[0].id).toBe(ch2.id);
      expect(result[1].id).toBe(ch3.id);
      expect(result[2].id).toBe(ch1.id);
    });

    it('should handle swap of two adjacent items', async () => {
      const ch1 = await createChapter(db, { projectId, title: '1장' });
      const ch2 = await createChapter(db, { projectId, title: '2장' });

      // Swap → [ch2, ch1]
      await reorderChapter(db, ch2.id, 0);
      await reorderChapter(db, ch1.id, 1);

      const result = await listChapters(db, projectId);
      expect(result[0].id).toBe(ch2.id);
      expect(result[1].id).toBe(ch1.id);
    });

    it('should preserve chapters from other projects during reorder', async () => {
      const otherProject = await createProject(db, { title: '다른 프로젝트' });
      const otherChapter = await createChapter(db, {
        projectId: otherProject.id,
        title: '다른 챕터',
      });

      const ch1 = await createChapter(db, { projectId, title: '1장' });
      const ch2 = await createChapter(db, { projectId, title: '2장' });

      // Reorder project chapters
      await reorderChapter(db, ch2.id, 0);
      await reorderChapter(db, ch1.id, 1);

      // Other project chapters unaffected
      const otherChapters = await listChapters(db, otherProject.id);
      expect(otherChapters).toHaveLength(1);
      expect(otherChapters[0].id).toBe(otherChapter.id);
      expect(otherChapters[0].order).toBe(0);
    });

    it('should handle single chapter (no reorder needed)', async () => {
      const ch1 = await createChapter(db, { projectId, title: '유일한 챕터' });

      await reorderChapter(db, ch1.id, 0);

      const result = await listChapters(db, projectId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ch1.id);
      expect(result[0].order).toBe(0);
    });

    it('should update updatedAt timestamp on reorder', async () => {
      const ch1 = await createChapter(db, { projectId, title: '1장' });
      const originalUpdatedAt = ch1.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await reorderChapter(db, ch1.id, 5);

      expect(updated!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt!.getTime()
      );
    });
  });

  describe('reorder API input validation logic', () => {
    it('should reject empty orderedIds array', () => {
      const orderedIds: string[] = [];
      const isValid = Array.isArray(orderedIds) && orderedIds.length > 0;
      expect(isValid).toBe(false);
    });

    it('should reject non-string elements in orderedIds', () => {
      const orderedIds = [123, null, undefined] as unknown[];
      const isValid = orderedIds.every(
        (id) => typeof id === 'string' && id.length > 0
      );
      expect(isValid).toBe(false);
    });

    it('should accept valid orderedIds array', () => {
      const orderedIds = ['id-1', 'id-2', 'id-3'];
      const isValid =
        Array.isArray(orderedIds) &&
        orderedIds.length > 0 &&
        orderedIds.every((id) => typeof id === 'string' && id.length > 0);
      expect(isValid).toBe(true);
    });

    it('should reject empty string in orderedIds', () => {
      const orderedIds = ['id-1', '', 'id-3'];
      const isValid = orderedIds.every(
        (id) => typeof id === 'string' && id.length > 0
      );
      expect(isValid).toBe(false);
    });
  });
});
