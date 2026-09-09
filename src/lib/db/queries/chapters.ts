import { asc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { chapters, characterEmotions } from '../schema';

type CreateChapterData = {
  projectId: string;
  title?: string;
  order?: number;
};

type UpdateChapterData = Partial<{
  title: string;
  outline: string;
  summary: string;
  memo: string;
  wordCount: number;
  storyYear: number | null;
  storyMonth: number | null;
  storyDay: number | null;
  storyTimeLabel: string | null;
  storyDatePrecision: 'none' | 'year' | 'month' | 'day' | 'time' | 'relative';
  storyDateLabel: string | null;
}>;

export async function createChapter(db: DB, data: CreateChapterData) {
  // Allocate the position and default title in the same write transaction, so
  // two tabs creating a chapter cannot receive the same automatic number.
  return db.transaction((tx) => {
    const existing = tx.select({ title: chapters.title, order: chapters.order })
      .from(chapters).where(eq(chapters.projectId, data.projectId)).all();
    const order = data.order ?? existing.reduce((last, chapter) => Math.max(last, chapter.order), -1) + 1;
    const nextNumber = existing.reduce((next, chapter) => {
      const match = chapter.title.match(/^제\s*(\d+)\s*장(?:$|[\s:：])/u);
      const number = match ? Number(match[1]) : 0;
      return Number.isSafeInteger(number) && number > 0 && number < Number.MAX_SAFE_INTEGER
        ? Math.max(next, number + 1) : next;
    }, order + 1);
    const requestedTitle = data.title?.trim();
    // Also support tabs still sending the previous default placeholder.
    const title = requestedTitle && requestedTitle !== '새 챕터'
      ? requestedTitle : `제 ${nextNumber}장`;
    return tx.insert(chapters).values({ projectId: data.projectId, title, order }).returning().all()[0];
  }, { behavior: 'immediate' });
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
