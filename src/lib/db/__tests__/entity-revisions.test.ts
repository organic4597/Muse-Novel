import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/lib/db';
import { createCharacter, deleteCharacter, updateCharacter } from '../queries/characters';
import { applyEntityRevision, type EntityTarget, getEntityRestorePreview, getEntityRevisionState, listEntityRevisions } from '../queries/entity-revisions';
import { createProject, deleteProject } from '../queries/projects';
import { renameWorldCategory } from '../queries/world-categories';
import { createWorldEntry, deleteWorldEntry, updateWorldEntry } from '../queries/world-entries';
import * as schema from '../schema';

describe('selected entity revision boundary', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: DB;
  let target: EntityTarget;
  beforeEach(async () => {
    sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema }); migrate(db, { migrationsFolder: './drizzle' });
    const project = await createProject(db, { title: '작품' });
    const entry = await createWorldEntry(db, { projectId: project.id, title: '소림사', category: '장소', content: '기존 설정' });
    target = { projectId: project.id, kind: 'world', entityId: entry.id };
  });
  afterEach(() => sqlite.close());

  it('makes reads/previews non-mutating and records only the approved selected fields', () => {
    const before = getEntityRevisionState(db, target);
    expect(listEntityRevisions(db, target).revisions).toEqual([]);
    const saved = applyEntityRevision(db, target, before.version, { changes: { content: '명예장로 설정 보강' } });
    expect(saved.snapshot).toMatchObject({ title: '소림사', category: '장소', content: '명예장로 설정 보강' });
    const [revision] = listEntityRevisions(db, target).revisions;
    const preview = getEntityRestorePreview(db, target, revision.id);
    expect(preview.changes).toEqual({ content: '기존 설정' });
    expect(getEntityRevisionState(db, target).snapshot.content).toBe('명예장로 설정 보강');
    expect(listEntityRevisions(db, target).revisions).toHaveLength(1);
  });
  it('backs up the current state during restore, so the restore itself can be undone', () => {
    const before = getEntityRevisionState(db, target);
    const saved = applyEntityRevision(db, target, before.version, { changes: { content: '새 설정' } });
    const originalId = listEntityRevisions(db, target).revisions[0].id;
    const restored = applyEntityRevision(db, target, saved.version, { revisionId: originalId });
    expect(restored.snapshot.content).toBe('기존 설정');
    const latestId = listEntityRevisions(db, target).revisions[0].id;
    expect(applyEntityRevision(db, target, restored.version, { revisionId: latestId }).snapshot.content).toBe('새 설정');
    expect(listEntityRevisions(db, target).revisions).toHaveLength(3);
  });
  it('rejects stale approvals and restores, including repeated save requests', async () => {
    const before = getEntityRevisionState(db, target);
    await updateWorldEntry(db, target.entityId, { content: '다른 화면의 수정' });
    const revision = listEntityRevisions(db, target).revisions[0];
    expect(() => applyEntityRevision(db, target, before.version, { changes: { content: '덮어쓰기' } })).toThrow('검토 중');
    expect(() => applyEntityRevision(db, target, before.version, { revisionId: revision.id })).toThrow('검토 중');
    expect(getEntityRevisionState(db, target).snapshot.content).toBe('다른 화면의 수정');
  });
  it('never restores another entity or another project’s snapshot', async () => {
    await updateWorldEntry(db, target.entityId, { content: '수정' });
    const revisionId = listEntityRevisions(db, target).revisions[0].id;
    const other = await createWorldEntry(db, { projectId: target.projectId, category: '장소', title: '다른 장소' });
    const otherTarget = { ...target, entityId: other.id };
    expect(() => getEntityRestorePreview(db, otherTarget, revisionId)).toThrow('이 항목의');
    expect(() => applyEntityRevision(db, otherTarget, getEntityRevisionState(db, otherTarget).version, { revisionId })).toThrow('이 항목의');
    const project = await createProject(db, { title: '다른 작품' });
    expect(() => getEntityRevisionState(db, { ...target, projectId: project.id })).toThrow('이 작품의');
  });
  it('records manual character changes but excludes media-only edits and no-op saves', async () => {
    const character = await createCharacter(db, { projectId: target.projectId, name: '검은 토끼', personality: '용감함', itemsJson: '[{"name":"약"}]' });
    const selected: EntityTarget = { ...target, kind: 'character', entityId: character.id };
    await updateCharacter(db, character.id, { imagePath: '/uploads/new.png' });
    await updateCharacter(db, character.id, { name: '검은 토끼', personality: undefined });
    expect(listEntityRevisions(db, selected).revisions).toHaveLength(0);
    await updateCharacter(db, character.id, { personality: null, itemsJson: null });
    const state = getEntityRevisionState(db, selected);
    expect(state.snapshot.personality).toBeNull();
    const restored = applyEntityRevision(db, selected, state.version, { revisionId: listEntityRevisions(db, selected).revisions[0].id });
    expect(restored.snapshot).toMatchObject({ personality: '용감함', itemsJson: '[{"name":"약"}]' });
    expect(restored.entry.imagePath).toBe('/uploads/new.png');
  });
  it('rejects writes to IDs, other entities, media, tags and links', () => {
    const state = getEntityRevisionState(db, target);
    for (const field of ['id', 'projectId', 'imagePath', 'tags', 'relationships']) {
      expect(() => applyEntityRevision(db, target, state.version, { changes: { [field]: '변경' } })).toThrow('필드나 형식');
    }
    expect(listEntityRevisions(db, target).revisions).toHaveLength(0);
  });
  it('rolls back the data change if the history insert fails', () => {
    sqlite.exec("CREATE TRIGGER fail_history BEFORE INSERT ON entity_revisions BEGIN SELECT RAISE(ABORT,'history failure'); END");
    const state = getEntityRevisionState(db, target);
    expect(() => applyEntityRevision(db, target, state.version, { changes: { content: '실패할 수정' } })).toThrow();
    expect(getEntityRevisionState(db, target).snapshot.content).toBe('기존 설정');
  });
  it('rolls back the history insert if the actual write fails', () => {
    sqlite.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON world_entries BEGIN SELECT RAISE(ABORT,'write failure'); END");
    expect(() => applyEntityRevision(db, target, getEntityRevisionState(db, target).version, { changes: { content: '실패' } })).toThrow();
    expect(listEntityRevisions(db, target).revisions).toHaveLength(0);
  });
  it('resolves old category names on restore instead of resurrecting renamed categories', async () => {
    await updateWorldEntry(db, target.entityId, { content: '다음 설정' });
    const revisionId = listEntityRevisions(db, target).revisions[0].id;
    await renameWorldCategory(db, target.projectId, '장소', '지역');
    const preview = getEntityRestorePreview(db, target, revisionId);
    expect(preview.changes.category).toBeUndefined();
    expect(applyEntityRevision(db, target, preview.baseVersion, { revisionId }).snapshot).toMatchObject({ category: '지역', content: '기존 설정' });
  });
  it('paginates metadata without sending full snapshots on every list call', async () => {
    for (let index = 0; index < 23; index += 1) await updateWorldEntry(db, target.entityId, { content: `수정 ${index}` });
    const first = listEntityRevisions(db, target);
    expect(first.revisions).toHaveLength(20); expect(first.hasMore).toBe(true);
    expect(first.revisions[0]).not.toHaveProperty('snapshotJson');
    const second = listEntityRevisions(db, target, first.revisions.at(-1)!.id);
    expect(second.revisions).toHaveLength(3); expect(second.hasMore).toBe(false);
  });
  it('removes owned history when its entity or project is deleted', async () => {
    await updateWorldEntry(db, target.entityId, { content: '수정' });
    await deleteWorldEntry(db, target.entityId);
    expect(listEntityRevisions(db, target).revisions).toHaveLength(0);
    const character = await createCharacter(db, { projectId: target.projectId, name: '인물' });
    await updateCharacter(db, character.id, { backstory: '과거' });
    await deleteCharacter(db, character.id);
    expect(sqlite.prepare('SELECT count(*) AS n FROM entity_revisions').get()).toEqual({ n: 0 });
    const another = await createWorldEntry(db, { projectId: target.projectId, title: '장소', category: '장소' });
    await updateWorldEntry(db, another.id, { content: '설정' });
    await deleteProject(db, target.projectId);
    expect(sqlite.prepare('SELECT count(*) AS n FROM entity_revisions').get()).toEqual({ n: 0 });
  });
});
