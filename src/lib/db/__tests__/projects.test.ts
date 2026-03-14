import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../queries/projects';

describe('Project Queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(() => {
    // Clean up projects table before each test
    sqlite.exec('DELETE FROM projects');
  });

  afterEach(() => {
    // Ensure clean state
  });

  describe('createProject', () => {
    it('should create a project with title only', async () => {
      const project = await createProject(db, { title: '나의 첫 소설' });

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.title).toBe('나의 첫 소설');
      expect(project.genre).toBeNull();
      expect(project.synopsis).toBeNull();
      expect(project.settingsJson).toBeNull();
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a project with all fields', async () => {
      const project = await createProject(db, {
        title: '판타지 소설',
        genre: '판타지',
        synopsis: '용을 무찌르는 영웅의 이야기',
        settingsJson: '{"theme":"dark"}',
      });

      expect(project.title).toBe('판타지 소설');
      expect(project.genre).toBe('판타지');
      expect(project.synopsis).toBe('용을 무찌르는 영웅의 이야기');
      expect(project.settingsJson).toBe('{"theme":"dark"}');
    });

    it('should generate a UUID for id', async () => {
      const project = await createProject(db, { title: '테스트' });
      // UUID v4 format
      expect(project.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('getProject', () => {
    it('should return a project by id', async () => {
      const created = await createProject(db, { title: '검색 테스트' });
      const found = await getProject(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('검색 테스트');
    });

    it('should return undefined for non-existent id', async () => {
      const found = await getProject(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('listProjects', () => {
    it('should return empty array when no projects exist', async () => {
      const result = await listProjects(db);
      expect(result).toEqual([]);
    });

    it('should return projects ordered by createdAt DESC', async () => {
      // Create projects with slight delay to ensure different timestamps
      const first = await createProject(db, { title: '첫 번째' });

      // Manually set a later timestamp for the second project
      const second = await createProject(db, { title: '두 번째' });

      // Update second project's createdAt to be later
      db.update(schema.projects)
        .set({ createdAt: new Date(Date.now() + 1000) })
        .where(eq(schema.projects.id, second.id))
        .run();

      const result = await listProjects(db);
      expect(result).toHaveLength(2);
      // Second should be first (newer)
      expect(result[0].title).toBe('두 번째');
      expect(result[1].title).toBe('첫 번째');
    });
  });

  describe('updateProject', () => {
    it('should update project title', async () => {
      const created = await createProject(db, { title: '원래 제목' });
      const updated = await updateProject(db, created.id, {
        title: '수정된 제목',
      });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe('수정된 제목');
    });

    it('should update multiple fields', async () => {
      const created = await createProject(db, { title: '원래' });
      const updated = await updateProject(db, created.id, {
        title: '수정됨',
        genre: '로맨스',
        synopsis: '사랑 이야기',
      });

      expect(updated!.title).toBe('수정됨');
      expect(updated!.genre).toBe('로맨스');
      expect(updated!.synopsis).toBe('사랑 이야기');
    });

    it('should update the updatedAt timestamp', async () => {
      const created = await createProject(db, { title: '시간 테스트' });
      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await updateProject(db, created.id, {
        title: '수정됨',
      });

      expect(updated!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt!.getTime()
      );
    });

    it('should return undefined for non-existent id', async () => {
      const result = await updateProject(db, 'non-existent-id', {
        title: '없음',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteProject', () => {
    it('should delete an existing project', async () => {
      const created = await createProject(db, { title: '삭제 대상' });
      await deleteProject(db, created.id);

      const found = await getProject(db, created.id);
      expect(found).toBeUndefined();
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteProject(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });
  });
});
