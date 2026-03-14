import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import {
  createRelationship,
  deleteRelationship,
  getRelationship,
  listRelationshipsForCharacter,
  updateRelationship,
} from '../queries/character-relationships';
import { createCharacter } from '../queries/characters';
import { createProject } from '../queries/projects';

describe('Character Relationship Queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;
  let characterAId: string;
  let characterBId: string;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });

    // Create project and two characters for relationship tests
    const project = await createProject(db, { title: '관계 테스트 소설' });
    projectId = project.id;

    const charA = await createCharacter(db, {
      projectId,
      name: '김철수',
      role: '주인공',
    });
    characterAId = charA.id;

    const charB = await createCharacter(db, {
      projectId,
      name: '이영희',
      role: '조연',
    });
    characterBId = charB.id;
  });

  beforeEach(() => {
    // Clean up relationships only before each test
    sqlite.exec('DELETE FROM character_relationships');
  });

  describe('createRelationship', () => {
    it('should create a relationship between two characters', async () => {
      const rel = await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '연인',
        description: '어린 시절부터 함께 자란 소꿉친구에서 연인으로 발전',
      });

      expect(rel).toBeDefined();
      expect(rel.id).toBeDefined();
      expect(rel.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(rel.characterAId).toBe(characterAId);
      expect(rel.characterBId).toBe(characterBId);
      expect(rel.relationshipType).toBe('연인');
      expect(rel.description).toBe(
        '어린 시절부터 함께 자란 소꿉친구에서 연인으로 발전'
      );
      expect(rel.createdAt).toBeInstanceOf(Date);
    });

    it('should create a relationship without description', async () => {
      const rel = await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '라이벌',
      });

      expect(rel).toBeDefined();
      expect(rel.relationshipType).toBe('라이벌');
      expect(rel.description).toBeNull();
    });

    it('should not allow relationship with same character (A === B)', async () => {
      await expect(
        createRelationship(db, {
          characterAId,
          characterBId: characterAId,
          relationshipType: '자기 자신',
        })
      ).rejects.toThrow();
    });
  });

  describe('getRelationship', () => {
    it('should return a relationship by id', async () => {
      const created = await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '동료',
      });

      const found = await getRelationship(db, created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.relationshipType).toBe('동료');
    });

    it('should return undefined for non-existent id', async () => {
      const found = await getRelationship(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('listRelationshipsForCharacter', () => {
    it('should list relationships for character A', async () => {
      await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '가족',
      });

      const results = await listRelationshipsForCharacter(db, characterAId);

      expect(results).toHaveLength(1);
      expect(results[0].relationshipType).toBe('가족');
      expect(results[0].otherCharacterName).toBe('이영희');
    });

    it('should list relationships for character B (bidirectional)', async () => {
      await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '스승-제자',
      });

      const results = await listRelationshipsForCharacter(db, characterBId);

      expect(results).toHaveLength(1);
      expect(results[0].relationshipType).toBe('스승-제자');
      expect(results[0].otherCharacterName).toBe('김철수');
    });

    it('should return empty array when no relationships exist', async () => {
      const results = await listRelationshipsForCharacter(db, characterAId);
      expect(results).toEqual([]);
    });
  });

  describe('updateRelationship', () => {
    it('should update relationship type', async () => {
      const created = await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '동료',
      });

      const updated = await updateRelationship(db, created.id, {
        relationshipType: '연인',
      });

      expect(updated).toBeDefined();
      expect(updated!.relationshipType).toBe('연인');
    });

    it('should update description', async () => {
      const created = await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '동료',
      });

      const updated = await updateRelationship(db, created.id, {
        description: '새로운 설명',
      });

      expect(updated).toBeDefined();
      expect(updated!.description).toBe('새로운 설명');
      expect(updated!.relationshipType).toBe('동료');
    });

    it('should return undefined for non-existent id', async () => {
      const result = await updateRelationship(db, 'non-existent-id', {
        relationshipType: '없음',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteRelationship', () => {
    it('should delete a relationship and both sides return empty', async () => {
      const created = await createRelationship(db, {
        characterAId,
        characterBId,
        relationshipType: '라이벌',
      });

      await deleteRelationship(db, created.id);

      const resultsA = await listRelationshipsForCharacter(db, characterAId);
      const resultsB = await listRelationshipsForCharacter(db, characterBId);

      expect(resultsA).toEqual([]);
      expect(resultsB).toEqual([]);
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteRelationship(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });
  });
});
