import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  reorderChapter,
  updateChapter,
  updateContent,
} from '../queries/chapters';
import { createProject } from '../queries/projects';
import * as schema from '../schema';

describe('Chapter Queries', () => {
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
    // Clean up tables before each test
    sqlite.exec('DELETE FROM chapters');
    sqlite.exec('DELETE FROM projects');

    // Create a project to use as parent
    const project = await createProject(db, { title: '테스트 프로젝트' });
    projectId = project.id;
  });

  afterEach(() => {
    // Ensure clean state
  });

  describe('createChapter', () => {
    it('should create a chapter with title and projectId', async () => {
      const chapter = await createChapter(db, {
        projectId,
        title: '제1장: 시작',
      });

      expect(chapter).toBeDefined();
      expect(chapter.id).toBeDefined();
      expect(chapter.projectId).toBe(projectId);
      expect(chapter.title).toBe('제1장: 시작');
      expect(chapter.order).toBe(0);
      expect(chapter.contentJson).toBeNull();
      expect(chapter.outline).toBeNull();
      expect(chapter.summary).toBeNull();
      expect(chapter.memo).toBeNull();
      expect(chapter.wordCount).toBe(0);
      expect(chapter.createdAt).toBeInstanceOf(Date);
      expect(chapter.updatedAt).toBeInstanceOf(Date);
    });

    it('should auto-assign order as max+1 when not provided', async () => {
      const ch1 = await createChapter(db, { projectId, title: '첫 번째' });
      const ch2 = await createChapter(db, { projectId, title: '두 번째' });
      const ch3 = await createChapter(db, { projectId, title: '세 번째' });

      expect(ch1.order).toBe(0);
      expect(ch2.order).toBe(1);
      expect(ch3.order).toBe(2);
    });

    it('should use explicit order when provided', async () => {
      const chapter = await createChapter(db, {
        projectId,
        title: '특정 순서',
        order: 5,
      });

      expect(chapter.order).toBe(5);
    });

    it('should generate a UUID for id', async () => {
      const chapter = await createChapter(db, { projectId, title: '테스트' });
      expect(chapter.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('getChapter', () => {
    it('should return a chapter by id', async () => {
      const created = await createChapter(db, {
        projectId,
        title: '검색 테스트',
      });
      const found = await getChapter(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('검색 테스트');
    });

    it('should return undefined for non-existent id', async () => {
      const found = await getChapter(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('listChapters', () => {
    it('should return empty array when no chapters exist', async () => {
      const result = await listChapters(db, projectId);
      expect(result).toEqual([]);
    });

    it('should return chapters ordered by order ASC', async () => {
      await createChapter(db, { projectId, title: '세 번째', order: 2 });
      await createChapter(db, { projectId, title: '첫 번째', order: 0 });
      await createChapter(db, { projectId, title: '두 번째', order: 1 });

      const result = await listChapters(db, projectId);
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('첫 번째');
      expect(result[1].title).toBe('두 번째');
      expect(result[2].title).toBe('세 번째');
    });

    it('should only return chapters for the given projectId', async () => {
      const otherProject = await createProject(db, { title: '다른 프로젝트' });

      await createChapter(db, { projectId, title: '프로젝트1 챕터' });
      await createChapter(db, {
        projectId: otherProject.id,
        title: '프로젝트2 챕터',
      });

      const result = await listChapters(db, projectId);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('프로젝트1 챕터');
    });
  });

  describe('updateChapter', () => {
    it('should update chapter title', async () => {
      const created = await createChapter(db, {
        projectId,
        title: '원래 제목',
      });
      const updated = await updateChapter(db, created.id, {
        title: '수정된 제목',
      });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('수정된 제목');
    });

    it('should update multiple fields', async () => {
      const created = await createChapter(db, { projectId, title: '원래' });
      const updated = await updateChapter(db, created.id, {
        title: '수정됨',
        outline: '개요 내용',
        summary: '요약 내용',
        memo: '메모 내용',
      });

      expect(updated!.title).toBe('수정됨');
      expect(updated!.outline).toBe('개요 내용');
      expect(updated!.summary).toBe('요약 내용');
      expect(updated!.memo).toBe('메모 내용');
    });

    it('should update the updatedAt timestamp', async () => {
      const created = await createChapter(db, {
        projectId,
        title: '시간 테스트',
      });
      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await updateChapter(db, created.id, {
        title: '수정됨',
      });

      expect(updated!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt!.getTime()
      );
    });

    it('should return undefined for non-existent id', async () => {
      const result = await updateChapter(db, 'non-existent-id', {
        title: '없음',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteChapter', () => {
    it('should delete an existing chapter', async () => {
      const created = await createChapter(db, {
        projectId,
        title: '삭제 대상',
      });
      await deleteChapter(db, created.id);

      const found = await getChapter(db, created.id);
      expect(found).toBeUndefined();
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteChapter(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });
  });

  describe('reorderChapter', () => {
    it('should update the order of a chapter', async () => {
      const chapter = await createChapter(db, { projectId, title: '이동할 챕터' });
      const updated = await reorderChapter(db, chapter.id, 5);

      expect(updated).toBeDefined();
      expect(updated!.order).toBe(5);
    });

    it('should return undefined for non-existent id', async () => {
      const result = await reorderChapter(db, 'non-existent-id', 3);
      expect(result).toBeUndefined();
    });
  });

  describe('updateContent', () => {
    it('should update contentJson only', async () => {
      const chapter = await createChapter(db, {
        projectId,
        title: '콘텐츠 테스트',
      });

      const contentJson = JSON.stringify([
        { type: 'p', children: [{ text: '안녕하세요' }] },
      ]);
      const updated = await updateContent(db, chapter.id, contentJson);

      expect(updated).toBeDefined();
      expect(updated!.contentJson).toBe(contentJson);
      expect(updated!.title).toBe('콘텐츠 테스트'); // title unchanged
    });

    it('should return undefined for non-existent id', async () => {
      const result = await updateContent(db, 'non-existent-id', '{}');
      expect(result).toBeUndefined();
    });
  });
});
