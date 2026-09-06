import { and, eq, like, or, sql } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { worldEntries, worldEntryLinks } from '../schema';

export async function createLink(db: DB, sourceId: string, targetId: string) {
  if (sourceId === targetId) {
    throw new Error('자기 자신에게 링크할 수 없습니다.');
  }

  const rows = db
    .insert(worldEntryLinks)
    .values({
      sourceId,
      targetId,
    })
    .returning()
    .all();

  return rows[0];
}

export async function getLinksForEntry(db: DB, entryId: string) {
  const outgoing = db
    .select({
      id: worldEntryLinks.id,
      targetId: worldEntryLinks.targetId,
      targetTitle: sql<string>`(SELECT ${worldEntries.title} FROM ${worldEntries} WHERE ${worldEntries.id} = ${worldEntryLinks.targetId})`.as(
        'target_title'
      ),
      createdAt: worldEntryLinks.createdAt,
    })
    .from(worldEntryLinks)
    .where(eq(worldEntryLinks.sourceId, entryId))
    .all();

  const incoming = db
    .select({
      id: worldEntryLinks.id,
      sourceId: worldEntryLinks.sourceId,
      sourceTitle: sql<string>`(SELECT ${worldEntries.title} FROM ${worldEntries} WHERE ${worldEntries.id} = ${worldEntryLinks.sourceId})`.as(
        'source_title'
      ),
      createdAt: worldEntryLinks.createdAt,
    })
    .from(worldEntryLinks)
    .where(eq(worldEntryLinks.targetId, entryId))
    .all();

  return { outgoing, incoming };
}

export async function deleteLink(db: DB, linkId: string) {
  db.delete(worldEntryLinks).where(eq(worldEntryLinks.id, linkId)).run();
}

export async function searchWorldEntries(
  db: DB,
  projectId: string,
  query: string
) {
  const pattern = `%${query}%`;

  return db
    .select()
    .from(worldEntries)
    .where(
      and(
        eq(worldEntries.projectId, projectId),
        or(
          like(worldEntries.title, pattern),
          like(worldEntries.content, pattern)
        )
      )
    )
    .all();
}
