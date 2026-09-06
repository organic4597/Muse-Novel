import { createHash } from 'node:crypto';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { DB } from '@/lib/db';
import { characters, entityRevisions, worldEntries } from '@/lib/db/schema';
import { type EntityKind, type EntitySnapshot, entityChanges, entitySnapshot, parseEntityPatch } from '@/lib/entity-revisions';
import { resolveStoredWorldCategoryName } from './world-categories';

export class EntityRevisionError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}
export type EntityRow = Record<string, unknown> & { id: string; projectId: string };
export type EntityTarget = { projectId: string; kind: EntityKind; entityId: string };

const scope = (target: EntityTarget) => and(eq(entityRevisions.projectId, target.projectId), eq(entityRevisions.kind, target.kind), eq(entityRevisions.entityId, target.entityId));

export function getEntityRevisionState(db: DB, target: EntityTarget) {
  const table = target.kind === 'character' ? characters : worldEntries;
  const entry = db.select().from(table).where(and(eq(table.projectId, target.projectId), eq(table.id, target.entityId))).get() as EntityRow | undefined;
  if (!entry) throw new EntityRevisionError('이 작품의 항목을 찾을 수 없습니다.', 404);
  const snapshot = entitySnapshot(target.kind, entry);
  const latest = db.select({ id: entityRevisions.id }).from(entityRevisions).where(scope(target)).orderBy(desc(entityRevisions.id)).limit(1).get();
  const version = createHash('sha256').update(JSON.stringify([target.projectId, target.kind, target.entityId, snapshot, latest?.id ?? 0])).digest('hex');
  return { entry, snapshot, version };
}

/** Call in the same transaction as the actual write. No history is added for media-only or no-op changes. */
export function captureEntityRevision(db: DB, kind: EntityKind, before: EntityRow, options: { after: Record<string, unknown>; reason?: string }) {
  const { after, reason = '수동 수정 전' } = options;
  const snapshot = entitySnapshot(kind, before);
  if (!Object.keys(entityChanges(snapshot, entitySnapshot(kind, after))).length) return;
  db.insert(entityRevisions).values({ projectId: before.projectId, kind, entityId: before.id,
    characterId: kind === 'character' ? before.id : null, worldEntryId: kind === 'world' ? before.id : null,
    snapshotJson: JSON.stringify(snapshot), reason,
  }).run();
}

export function listEntityRevisions(db: DB, target: EntityTarget, beforeId?: number) {
  const rows = db.select({ id: entityRevisions.id, reason: entityRevisions.reason, createdAt: entityRevisions.createdAt })
    .from(entityRevisions).where(and(scope(target), beforeId ? lt(entityRevisions.id, beforeId) : undefined))
    .orderBy(desc(entityRevisions.id)).limit(21).all();
  return { revisions: rows.slice(0, 20), hasMore: rows.length > 20 };
}

export function getEntityRestorePreview(db: DB, target: EntityTarget, revisionId: number) {
  const state = getEntityRevisionState(db, target);
  const revision = db.select().from(entityRevisions).where(and(scope(target), eq(entityRevisions.id, revisionId))).get();
  if (!revision) throw new EntityRevisionError('이 항목의 수정 이력을 찾을 수 없습니다.', 404);
  const snapshot = entitySnapshot(target.kind, JSON.parse(revision.snapshotJson));
  // Category names can have been renamed or removed since this snapshot was saved.
  if (target.kind === 'world' && snapshot.category) snapshot.category = resolveStoredWorldCategoryName(db, target.projectId, snapshot.category);
  return { before: state.snapshot, changes: entityChanges(state.snapshot, snapshot), baseVersion: state.version, revisionId };
}

export function applyEntityRevision(db: DB, target: EntityTarget, expectedVersion: string, input: { changes: unknown } | { revisionId: number }) {
  return db.transaction((tx: DB) => {
    const state = getEntityRevisionState(tx, target);
    if (state.version !== expectedVersion) throw new EntityRevisionError('검토 중 이 항목이 변경되었습니다. 최신 내용으로 수정안을 다시 생성하거나 복원 내용을 다시 확인해주세요.');
    const restoring = 'revisionId' in input;
    const patch = restoring ? getEntityRestorePreview(tx, target, input.revisionId).changes : parseEntityPatch(target.kind, input.changes);
    if (target.kind === 'world' && patch.category) patch.category = resolveStoredWorldCategoryName(tx, target.projectId, patch.category);
    const changes = entityChanges(state.snapshot, patch);
    if (!Object.keys(changes).length) return state;
    const next = { ...state.entry, ...changes };
    captureEntityRevision(tx, target.kind, state.entry, { after: next, reason: restoring ? `이력 #${input.revisionId} 복원 전` : 'AI 수정 승인 전' });
    const table = target.kind === 'character' ? characters : worldEntries;
    tx.update(table).set({ ...changes, updatedAt: new Date() }).where(and(eq(table.projectId, target.projectId), eq(table.id, target.entityId))).run();
    return getEntityRevisionState(tx, target);
  }, { behavior: 'immediate' });
}
