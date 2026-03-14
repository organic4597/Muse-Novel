import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import {
  createEmotion,
  deleteEmotion,
  listEmotionsForCharacter,
  updateEmotion,
} from '../queries/character-emotions';
import { createCharacter } from '../queries/characters';
import { createProject } from '../queries/projects';
import { createChapter } from '../queries/chapters';

describe('Character Emotion Queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;
  let characterId: string;
  let chapterId: string;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(async () => {
    sqlite.exec('DELETE FROM character_emotions');
    sqlite.exec('DELETE FROM character_relationships');
    sqlite.exec('DELETE FROM characters');
    sqlite.exec('DELETE FROM chapters');
    sqlite.exec('DELETE FROM projects');

    const project = await createProject(db, { title: '테스트 소설' });
    projectId = project.id;

    const character = await createCharacter(db, {
      projectId,
      name: '김철수',
    });
    characterId = character.id;

    const chapter = await createChapter(db, {
      projectId,
      title: '1장',
      order: 1,
    });
    chapterId = chapter.id;
  });

  describe('createEmotion', () => {
    it('should create an emotion with required fields', async () => {
      const emotion = await createEmotion(db, {
        characterId,
        chapterId,
        emotion: '기쁨',
      });

      expect(emotion).toBeDefined();
      expect(emotion.id).toBeDefined();
      expect(emotion.characterId).toBe(characterId);
      expect(emotion.chapterId).toBe(chapterId);
      expect(emotion.emotion).toBe('기쁨');
      expect(emotion.note).toBeNull();
      expect(emotion.createdAt).toBeInstanceOf(Date);
    });

    it('should create an emotion with a note', async () => {
      const emotion = await createEmotion(db, {
        characterId,
        chapterId,
        emotion: '슬픔',
        note: '친구를 잃은 후의 감정',
      });

      expect(emotion.emotion).toBe('슬픔');
      expect(emotion.note).toBe('친구를 잃은 후의 감정');
    });

    it('should generate a UUID for id', async () => {
      const emotion = await createEmotion(db, {
        characterId,
        chapterId,
        emotion: '분노',
      });

      expect(emotion.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });
  });

  describe('listEmotionsForCharacter', () => {
    it('should return empty array when no emotions exist', async () => {
      const result = await listEmotionsForCharacter(db, characterId);
      expect(result).toEqual([]);
    });

    it('should return emotions with chapter info joined', async () => {
      await createEmotion(db, {
        characterId,
        chapterId,
        emotion: '설렘',
        note: '첫 만남',
      });

      const result = await listEmotionsForCharacter(db, characterId);
      expect(result).toHaveLength(1);
      expect(result[0].emotion).toBe('설렘');
      expect(result[0].note).toBe('첫 만남');
      expect(result[0].chapterTitle).toBe('1장');
      expect(result[0].chapterOrder).toBe(1);
    });

    it('should order emotions by chapter order ASC', async () => {
      const chapter2 = await createChapter(db, {
        projectId,
        title: '2장',
        order: 2,
      });

      const chapter3 = await createChapter(db, {
        projectId,
        title: '3장',
        order: 3,
      });

      await createEmotion(db, { characterId, chapterId: chapter3.id, emotion: '체념' });
      await createEmotion(db, { characterId, chapterId: chapterId, emotion: '기대' });
      await createEmotion(db, { characterId, chapterId: chapter2.id, emotion: '갈등' });

      const result = await listEmotionsForCharacter(db, characterId);
      expect(result).toHaveLength(3);
      expect(result[0].emotion).toBe('기대');
      expect(result[0].chapterOrder).toBe(1);
      expect(result[1].emotion).toBe('갈등');
      expect(result[1].chapterOrder).toBe(2);
      expect(result[2].emotion).toBe('체념');
      expect(result[2].chapterOrder).toBe(3);
    });

    it('should only return emotions for the given character', async () => {
      const otherCharacter = await createCharacter(db, {
        projectId,
        name: '이영희',
      });

      await createEmotion(db, { characterId, chapterId, emotion: '내 감정' });
      await createEmotion(db, {
        characterId: otherCharacter.id,
        chapterId,
        emotion: '다른 감정',
      });

      const result = await listEmotionsForCharacter(db, characterId);
      expect(result).toHaveLength(1);
      expect(result[0].emotion).toBe('내 감정');
    });
  });

  describe('updateEmotion', () => {
    it('should update the emotion text', async () => {
      const created = await createEmotion(db, {
        characterId,
        chapterId,
        emotion: '원래 감정',
      });

      const updated = await updateEmotion(db, created.id, {
        emotion: '수정된 감정',
      });

      expect(updated).toBeDefined();
      expect(updated!.emotion).toBe('수정된 감정');
    });

    it('should update the note', async () => {
      const created = await createEmotion(db, {
        characterId,
        chapterId,
        emotion: '기쁨',
        note: '원래 메모',
      });

      const updated = await updateEmotion(db, created.id, {
        note: '수정된 메모',
      });

      expect(updated!.note).toBe('수정된 메모');
    });

    it('should return undefined for non-existent id', async () => {
      const result = await updateEmotion(db, 'non-existent-id', {
        emotion: '없음',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteEmotion', () => {
    it('should delete an existing emotion', async () => {
      const created = await createEmotion(db, {
        characterId,
        chapterId,
        emotion: '삭제 대상',
      });

      await deleteEmotion(db, created.id);

      const result = await listEmotionsForCharacter(db, characterId);
      expect(result).toHaveLength(0);
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteEmotion(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });
  });
});
