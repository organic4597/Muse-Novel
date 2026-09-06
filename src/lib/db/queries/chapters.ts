import { asc, eq, max } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { chapters, characterEmotions } from '../schema';

type CreateChapterData = {
  projectId: string;
  title: string;
  order?: number;
};

type UpdateChapterData = Partial<{
  title: string;
  outline: string;
  summary: string;
  memo: string;
  wordCount: number;
}>;

export async function createChapter(db: DB, data: CreateChapterData) {
  let order = data.order;

  if (order === undefined) {
    const result = db
      .select({ maxOrder: max(chapters.order) })
      .from(chapters)
      .where(eq(chapters.projectId, data.projectId))
      .all();

    const currentMax = result[0]?.maxOrder;
    order = currentMax !== null && currentMax !== undefined ? currentMax + 1 : 0;
  }

  const rows = db
    .insert(chapters)
    .values({
      projectId: data.projectId,
      title: data.title,
      order,
    })
    .returning()
    .all();

  return rows[0];
}

export async function getChapter(db: DB, id: string) {
  const rows = db
    .select()
    .from(chapters)
    .where(eq(chapters.id, id))
    .all();

  return rows[0] ?? undefined;
}

export async function getChapterProjectId(db: DB, id: string) {
  const rows = db
    .select({ projectId: chapters.projectId })
    .from(chapters)
    .where(eq(chapters.id, id))
    .all();

  return rows[0]?.projectId;
}

export async function getChapterSummary(db: DB, id: string) {
  const rows = db
    .select({
      id: chapters.id,
      order: chapters.order,
      outline: chapters.outline,
      projectId: chapters.projectId,
      summary: chapters.summary,
      title: chapters.title,
      wordCount: chapters.wordCount,
    })
    .from(chapters)
    .where(eq(chapters.id, id))
    .all();

  return rows[0];
}

export async function listChapters(db: DB, projectId: string) {
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.projectId, projectId))
    .orderBy(asc(chapters.order))
    .all();
}

export async function listChapterSummaries(db: DB, projectId: string) {
  return db
    .select({
      createdAt: chapters.createdAt,
      id: chapters.id,
      memo: chapters.memo,
      order: chapters.order,
      outline: chapters.outline,
      projectId: chapters.projectId,
      summary: chapters.summary,
      title: chapters.title,
      updatedAt: chapters.updatedAt,
      wordCount: chapters.wordCount,
    })
    .from(chapters)
    .where(eq(chapters.projectId, projectId))
    .orderBy(asc(chapters.order))
    .all();
}

export async function updateChapter(
  db: DB,
  id: string,
  data: UpdateChapterData
) {
  const rows = db
    .update(chapters)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(chapters.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function deleteChapter(db: DB, id: string) {
  db.transaction((tx) => {
    tx.delete(characterEmotions)
      .where(eq(characterEmotions.chapterId, id))
      .run();
    tx.delete(chapters).where(eq(chapters.id, id)).run();
  });
}

export async function reorderChapter(db: DB, id: string, newOrder: number) {
  const rows = db
    .update(chapters)
    .set({
      order: newOrder,
      updatedAt: new Date(),
    })
    .where(eq(chapters.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function updateContent(
  db: DB,
  id: string,
  contentJson: string
) {
  const rows = db
    .update(chapters)
    .set({
      contentJson,
      updatedAt: new Date(),
    })
    .where(eq(chapters.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}
