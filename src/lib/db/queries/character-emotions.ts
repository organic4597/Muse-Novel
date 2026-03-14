import { asc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { chapters, characterEmotions } from '../schema';

type CreateEmotionData = {
  characterId: string;
  chapterId: string;
  emotion: string;
  note?: string;
};

type UpdateEmotionData = Partial<{
  emotion: string;
  note: string;
}>;

export async function createEmotion(db: DB, data: CreateEmotionData) {
  const rows = db
    .insert(characterEmotions)
    .values({
      characterId: data.characterId,
      chapterId: data.chapterId,
      emotion: data.emotion,
      note: data.note ?? null,
    })
    .returning()
    .all();

  return rows[0];
}

export async function listEmotionsForCharacter(db: DB, characterId: string) {
  return db
    .select({
      id: characterEmotions.id,
      characterId: characterEmotions.characterId,
      chapterId: characterEmotions.chapterId,
      emotion: characterEmotions.emotion,
      note: characterEmotions.note,
      createdAt: characterEmotions.createdAt,
      chapterTitle: chapters.title,
      chapterOrder: chapters.order,
    })
    .from(characterEmotions)
    .innerJoin(chapters, eq(characterEmotions.chapterId, chapters.id))
    .where(eq(characterEmotions.characterId, characterId))
    .orderBy(asc(chapters.order))
    .all();
}

export async function updateEmotion(db: DB, id: string, data: UpdateEmotionData) {
  const rows = db
    .update(characterEmotions)
    .set(data)
    .where(eq(characterEmotions.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function deleteEmotion(db: DB, id: string) {
  db.delete(characterEmotions).where(eq(characterEmotions.id, id)).run();
}
