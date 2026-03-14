import { and, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { worldEntries, worldEntryTags } from '../schema';

export async function addTag(db: DB, entryId: string, tag: string) {
  const rows = db
    .insert(worldEntryTags)
    .values({
      entryId,
      tag,
    })
    .returning()
    .all();

  return rows[0];
}

export async function listTags(db: DB, entryId: string) {
  return db
    .select()
    .from(worldEntryTags)
    .where(eq(worldEntryTags.entryId, entryId))
    .all();
}

export async function deleteTag(db: DB, tagId: string) {
  db.delete(worldEntryTags).where(eq(worldEntryTags.id, tagId)).run();
}

export async function listEntriesByTag(db: DB, projectId: string, tag: string) {
  const matchingTags = db
    .select({ entryId: worldEntryTags.entryId })
    .from(worldEntryTags)
    .where(eq(worldEntryTags.tag, tag))
    .all();

  const entryIds = matchingTags.map((t) => t.entryId);

  if (entryIds.length === 0) {
    return [];
  }

  const entries = db
    .select()
    .from(worldEntries)
    .where(eq(worldEntries.projectId, projectId))
    .all();

  return entries.filter((e) => entryIds.includes(e.id));
}
