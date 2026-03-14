import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
} from '../queries/characters';
import { createProject } from '../queries/projects';

describe('Character Queries', () => {
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
    sqlite.exec('DELETE FROM characters');
    sqlite.exec('DELETE FROM projects');

    // Create a project to use as parent
    const project = await createProject(db, { title: '테스트 소설' });
    projectId = project.id;
  });

  afterEach(() => {
    // Ensure clean state
  });

  describe('createCharacter', () => {
    it('should create a character with name only', async () => {
      const character = await createCharacter(db, {
        projectId,
        name: '김철수',
      });

      expect(character).toBeDefined();
      expect(character.id).toBeDefined();
      expect(character.projectId).toBe(projectId);
      expect(character.name).toBe('김철수');
      expect(character.role).toBeNull();
      expect(character.appearance).toBeNull();
      expect(character.personality).toBeNull();
      expect(character.backstory).toBeNull();
      expect(character.arcDescription).toBeNull();
      expect(character.imagePath).toBeNull();
      expect(character.createdAt).toBeInstanceOf(Date);
      expect(character.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a character with all fields', async () => {
      const character = await createCharacter(db, {
        projectId,
        name: '이영희',
        role: '주인공',
        appearance: '긴 검은 머리에 큰 눈',
        personality: '용감하고 정의로운',
        backstory: '어린 시절부터 마법을 연습해왔다',
        arcDescription: '소심한 소녀에서 강력한 마법사로 성장',
      });

      expect(character.name).toBe('이영희');
      expect(character.role).toBe('주인공');
      expect(character.appearance).toBe('긴 검은 머리에 큰 눈');
      expect(character.personality).toBe('용감하고 정의로운');
      expect(character.backstory).toBe('어린 시절부터 마법을 연습해왔다');
      expect(character.arcDescription).toBe('소심한 소녀에서 강력한 마법사로 성장');
    });

    it('should generate a UUID for id', async () => {
      const character = await createCharacter(db, {
        projectId,
        name: '테스트',
      });
      // UUID v4 format
      expect(character.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('getCharacter', () => {
    it('should return a character by id', async () => {
      const created = await createCharacter(db, {
        projectId,
        name: '검색 캐릭터',
      });
      const found = await getCharacter(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe('검색 캐릭터');
    });

    it('should return undefined for non-existent id', async () => {
      const found = await getCharacter(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('listCharacters', () => {
    it('should return empty array when no characters exist', async () => {
      const result = await listCharacters(db, projectId);
      expect(result).toEqual([]);
    });

    it('should return characters ordered by createdAt DESC', async () => {
      const first = await createCharacter(db, {
        projectId,
        name: '첫 번째 캐릭터',
      });

      const second = await createCharacter(db, {
        projectId,
        name: '두 번째 캐릭터',
      });

      // Update second character's createdAt to be later
      db.update(schema.characters)
        .set({ createdAt: new Date(Date.now() + 1000) })
        .where(eq(schema.characters.id, second.id))
        .run();

      const result = await listCharacters(db, projectId);
      expect(result).toHaveLength(2);
      // Second should be first (newer)
      expect(result[0].name).toBe('두 번째 캐릭터');
      expect(result[1].name).toBe('첫 번째 캐릭터');
    });

    it('should only return characters for the given project', async () => {
      const otherProject = await createProject(db, { title: '다른 소설' });

      await createCharacter(db, { projectId, name: '내 캐릭터' });
      await createCharacter(db, {
        projectId: otherProject.id,
        name: '다른 캐릭터',
      });

      const result = await listCharacters(db, projectId);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('내 캐릭터');
    });
  });

  describe('updateCharacter', () => {
    it('should update character name', async () => {
      const created = await createCharacter(db, {
        projectId,
        name: '원래 이름',
      });
      const updated = await updateCharacter(db, created.id, {
        name: '수정된 이름',
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('수정된 이름');
    });

    it('should update multiple fields', async () => {
      const created = await createCharacter(db, {
        projectId,
        name: '원래',
      });
      const updated = await updateCharacter(db, created.id, {
        name: '수정됨',
        role: '악역',
        personality: '냉철하고 계산적인',
      });

      expect(updated!.name).toBe('수정됨');
      expect(updated!.role).toBe('악역');
      expect(updated!.personality).toBe('냉철하고 계산적인');
    });

    it('should update the updatedAt timestamp', async () => {
      const created = await createCharacter(db, {
        projectId,
        name: '시간 테스트',
      });
      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await updateCharacter(db, created.id, {
        name: '수정됨',
      });

      expect(updated!.updatedAt!.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt!.getTime()
      );
    });

    it('should return undefined for non-existent id', async () => {
      const result = await updateCharacter(db, 'non-existent-id', {
        name: '없음',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteCharacter', () => {
    it('should delete an existing character', async () => {
      const created = await createCharacter(db, {
        projectId,
        name: '삭제 대상',
      });
      await deleteCharacter(db, created.id);

      const found = await getCharacter(db, created.id);
      expect(found).toBeUndefined();
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteCharacter(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });
  });
});
