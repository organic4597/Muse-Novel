import { and, desc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { worldEntries } from '../schema';

type CreateWorldEntryData = {
  projectId: string;
  category: string;
  title: string;
  content?: string;
};

type UpdateWorldEntryData = Partial<Omit<CreateWorldEntryData, 'projectId'>>;

export async function createWorldEntry(db: DB, data: CreateWorldEntryData) {
  const rows = db
    .insert(worldEntries)
    .values({
      projectId: data.projectId,
      category: data.category,
      title: data.title,
      content: data.content ?? null,
    })
    .returning()
    .all();

  return rows[0];
}

export async function getWorldEntry(db: DB, id: string) {
  const rows = db
    .select()
    .from(worldEntries)
    .where(eq(worldEntries.id, id))
    .all();

  return rows[0] ?? undefined;
}

export async function listWorldEntries(
  db: DB,
  projectId: string,
  opts?: { category?: string }
) {
  const conditions = [eq(worldEntries.projectId, projectId)];

  if (opts?.category) {
    conditions.push(eq(worldEntries.category, opts.category));
  }

  return db
    .select()
    .from(worldEntries)
    .where(and(...conditions))
    .orderBy(desc(worldEntries.createdAt))
    .all();
}

export async function updateWorldEntry(
  db: DB,
  id: string,
  data: UpdateWorldEntryData
) {
  const rows = db
    .update(worldEntries)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(worldEntries.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function deleteWorldEntry(db: DB, id: string) {
  db.delete(worldEntries).where(eq(worldEntries.id, id)).run();
}
