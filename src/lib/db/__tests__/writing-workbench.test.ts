import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../schema';
import { getScene, saveScene, getWritingWorkbenchContext } from '../queries/writing-workbench';
import { EMPTY_SCENE, relevantExamples } from '@/lib/writing-workbench';

describe('scene and writing example ownership', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  beforeEach(() => {
    sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema }); migrate(db, { migrationsFolder: './drizzle' });
    db.insert(schema.projects).values([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]).run();
    db.insert(schema.chapters).values([{ id: 'ca', projectId: 'a', title: '1', order: 1 }, { id: 'cb', projectId: 'b', title: '1', order: 1 }]).run();
  });
  afterEach(() => sqlite.close());
  it('rejects cross-project chapters and stale scene saves', () => {
    const data = { title: '수색', status: 'draft' as const, plan: { ...EMPTY_SCENE, viewpoint: '곽진봉', conceal: '토끼의 정체' } };
    expect(() => saveScene(db, 'a', 'cb', data)).toThrow();
    const draft = saveScene(db, 'a', 'ca', data);
    expect(() => getScene(db, 'b', 'cb', draft.id)).toThrow();
    expect(getWritingWorkbenchContext(db, 'a', { chapterId: 'ca', sceneId: draft.id }).scene).toBe('');
    const confirmed = saveScene(db, 'a', 'ca', { ...data, id: draft.id, revision: 1, status: 'confirmed' });
    expect(confirmed.revision).toBe(2);
    expect(getWritingWorkbenchContext(db, 'a', { chapterId: 'ca', sceneId: draft.id, compact: true }).scene).toContain('토끼의 정체');
    expect(() => saveScene(db, 'a', 'ca', { ...data, id: draft.id, revision: 1 })).toThrow('SCENE_CONFLICT');
  });
  it('does not retrieve another project examples and labels rejected examples', () => {
    db.insert(schema.writingExamples).values({ projectId: 'b', kind: 'style', verdict: 'accepted', title: '비공개', replacement: '다른 작품 문장' }).run();
    expect(getWritingWorkbenchContext(db, 'a', { chapterId: 'ca' }).examples).toBe('');
    expect(relevantExamples([{ id: 'x', kind: 'edit', verdict: 'rejected', title: '대사 변경', original: '원문', replacement: '나쁜 예', reason: '화자 변경' }], '대사')).toContain('모방 금지');
  });
});
