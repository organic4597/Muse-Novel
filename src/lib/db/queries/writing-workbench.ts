import { and, desc, eq } from 'drizzle-orm';
import type { DB } from '@/lib/db';
import { chapters, writingScenes, writingExamples } from '@/lib/db/schema';
import { sceneContext, relevantExamples, type ScenePlan } from '@/lib/writing-workbench';

export function assertWorkbenchChapter(db: DB, projectId: string, chapterId: string) {
  const chapter = db.select({ id: chapters.id }).from(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId))).get();
  if (!chapter) throw new Error('CHAPTER_NOT_FOUND');
}
export function listScenes(db: DB, projectId: string, chapterId: string) {
  assertWorkbenchChapter(db, projectId, chapterId);
  return db.select().from(writingScenes).where(and(eq(writingScenes.projectId, projectId), eq(writingScenes.chapterId, chapterId))).orderBy(writingScenes.createdAt).all();
}
export function getScene(db: DB, projectId: string, chapterId: string, sceneId: string) {
  const row = db.select().from(writingScenes).where(and(eq(writingScenes.id, sceneId), eq(writingScenes.projectId, projectId), eq(writingScenes.chapterId, chapterId))).get();
  if (!row) throw new Error('SCENE_NOT_FOUND');
  return row;
}
export function saveScene(db: DB, projectId: string, chapterId: string, data: { id?: string; revision?: number; title: string; status: 'draft' | 'confirmed'; plan: ScenePlan }) {
  assertWorkbenchChapter(db, projectId, chapterId);
  const values = { title: data.title, status: data.status, planJson: JSON.stringify(data.plan), updatedAt: new Date() };
  if (!data.id) return db.insert(writingScenes).values({ ...values, projectId, chapterId }).returning().get();
  const row = getScene(db, projectId, chapterId, data.id);
  if (row.revision !== data.revision) throw new Error('SCENE_CONFLICT');
  const updated = db.update(writingScenes).set({ ...values, revision: row.revision + 1 }).where(and(eq(writingScenes.id, row.id), eq(writingScenes.revision, row.revision))).returning().get();
  if (!updated) throw new Error('SCENE_CONFLICT');
  return updated;
}
export function listWritingExamples(db: DB, projectId: string) {
  return db.select().from(writingExamples).where(eq(writingExamples.projectId, projectId)).orderBy(desc(writingExamples.createdAt)).limit(200).all();
}
export function getWritingWorkbenchContext(db: DB, projectId: string, { chapterId, sceneId, focus = '', compact = false }: { chapterId?: string; sceneId?: string | null; focus?: string; compact?: boolean }) {
  const scene = sceneId && chapterId ? getScene(db, projectId, chapterId, sceneId) : undefined;
  if (sceneId && !chapterId) throw new Error('CHAPTER_NOT_FOUND');
  return { scene: sceneContext(scene, compact),
    examples: compact ? '' : relevantExamples(listWritingExamples(db, projectId), focus) };
}
