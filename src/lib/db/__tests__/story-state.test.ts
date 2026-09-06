import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createChapter } from '../queries/chapters';
import { createCharacter, deleteCharacter } from '../queries/characters';
import { createProject } from '../queries/projects';
import {
  createStoryStateEntry,
  deleteStoryStateEntry,
  getStoryStateEntry,
  listStoryStateEntries,
  updateStoryStateEntry,
} from '../queries/story-state';
import * as schema from '../schema';

describe('Story State Queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;
  let chapterId: string;
  let characterId: string;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(async () => {
    sqlite.exec('DELETE FROM story_state_entries');
    sqlite.exec('DELETE FROM chapters');
    sqlite.exec('DELETE FROM characters');
    sqlite.exec('DELETE FROM projects');

    const project = await createProject(db, { title: '상태 메모 테스트' });
    const chapter = await createChapter(db, {
      order: 2,
      projectId: project.id,
      title: '3장 변화',
    });
    const character = await createCharacter(db, {
      name: '검은 토끼',
      projectId: project.id,
    });
    projectId = project.id;
    chapterId = chapter.id;
    characterId = character.id;
  });

  it('인물과 챕터를 연결한 현재 상태를 저장하고 조회한다', async () => {
    const created = await createStoryStateEntry(db, {
      category: '신체 상태',
      chapterId,
      characterId,
      details: '운기 시 통증이 심해진다.',
      isPinned: 1,
      label: '오른팔',
      previousValue: '정상',
      projectId,
      value: '깊은 자상',
    });

    const rows = await listStoryStateEntries(db, projectId);

    expect(created).toBeDefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chapterTitle: '3장 변화',
      characterName: '검은 토끼',
      isActive: 1,
      isPinned: 1,
      label: '오른팔',
      previousValue: '정상',
      value: '깊은 자상',
    });
  });

  it('종료된 이력을 현재 상태 조회에서 제외한다', async () => {
    const active = await createStoryStateEntry(db, {
      category: '소지품',
      label: '청룡검',
      projectId,
      value: '소지 중',
    });
    const archived = await createStoryStateEntry(db, {
      category: '위치',
      isActive: 0,
      label: '소재지',
      projectId,
      value: '낙양',
    });

    const rows = await listStoryStateEntries(db, projectId, {
      activeOnly: true,
    });

    expect(rows.map((row) => row.id)).toEqual([active.id]);
    expect(rows.map((row) => row.id)).not.toContain(archived.id);
  });

  it('상태를 수정하고 삭제한다', async () => {
    const created = await createStoryStateEntry(db, {
      category: '기술',
      label: '나한권',
      projectId,
      value: '입문',
    });

    const updated = await updateStoryStateEntry(db, created.id, {
      isPinned: 1,
      previousValue: '입문',
      value: '성취',
    });
    expect(updated).toMatchObject({
      isPinned: 1,
      previousValue: '입문',
      value: '성취',
    });

    await deleteStoryStateEntry(db, created.id);
    expect(await getStoryStateEntry(db, created.id)).toBeUndefined();
  });

  it('연결된 인물이 삭제되어도 작품 상태 이력을 보존한다', async () => {
    const created = await createStoryStateEntry(db, {
      category: '목표',
      characterId,
      label: '소림 입문',
      projectId,
      value: '진행 중',
    });

    await deleteCharacter(db, characterId);

    expect(await getStoryStateEntry(db, created.id)).toMatchObject({
      characterId: null,
      value: '진행 중',
    });
  });
});
