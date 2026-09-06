import { and, desc, eq, or } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { worldEntries, worldEntryLinks, worldEntryTags } from '../schema';
import { captureEntityRevision, type EntityRow } from './entity-revisions';
import { resolveStoredWorldCategoryName } from './world-categories';

type CreateWorldEntryData = {
  projectId: string;
  category: string;
  title: string;
  content?: string | null;
  researchJson?: string | null;
};

type UpdateWorldEntryData = Partial<Omit<CreateWorldEntryData, 'projectId'>>;

export type WorldEntryWithTags = typeof worldEntries.$inferSelect & {
  tags: Array<{ id: string; tag: string }>;
};

export async function createWorldEntry(db: DB, data: CreateWorldEntryData) {
  const rows = db
    .insert(worldEntries)
    .values({
      projectId: data.projectId,
      category: resolveStoredWorldCategoryName(db, data.projectId, data.category),
      title: data.title,
      content: data.content ?? null,
      researchJson: data.researchJson ?? null,
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

export async function listWorldEntriesWithTags(
  db: DB,
  projectId: string,
  opts?: { category?: string }
): Promise<WorldEntryWithTags[]> {
  const entries = await listWorldEntries(
    db,
    projectId,
    opts
  ) as (typeof worldEntries.$inferSelect)[];
  if (entries.length === 0) return [];

  const tags = db
    .select({
      entryId: worldEntryTags.entryId,
      id: worldEntryTags.id,
      tag: worldEntryTags.tag,
    })
    .from(worldEntryTags)
    .innerJoin(worldEntries, eq(worldEntryTags.entryId, worldEntries.id))
    .where(eq(worldEntries.projectId, projectId))
    .all();
  const tagsByEntry = new Map<string, Array<{ id: string; tag: string }>>();

  for (const tag of tags) {
    const current = tagsByEntry.get(tag.entryId) ?? [];
    current.push({ id: tag.id, tag: tag.tag });
    tagsByEntry.set(tag.entryId, current);
  }

  return entries.map((entry) => ({
    ...entry,
    tags: tagsByEntry.get(entry.id) ?? [],
  }));
}

export async function updateWorldEntry(
  db: DB,
  id: string,
  data: UpdateWorldEntryData
) {
  return db.transaction((tx: DB) => {
    const before = tx.select().from(worldEntries).where(eq(worldEntries.id, id)).get();
    if (!before) return undefined;
    const changes = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    if (typeof changes.category === 'string') changes.category = resolveStoredWorldCategoryName(tx, before.projectId, changes.category);
    captureEntityRevision(tx, 'world', before as EntityRow, { after: { ...before, ...changes } });
    return tx.update(worldEntries).set({ ...changes, updatedAt: new Date() }).where(eq(worldEntries.id, id)).returning().all()[0];
  }, { behavior: 'immediate' });
}

export async function deleteWorldEntry(db: DB, id: string) {
  db.transaction((tx) => {
    tx.delete(worldEntryTags).where(eq(worldEntryTags.entryId, id)).run();
    tx.delete(worldEntryLinks)
      .where(
        or(
          eq(worldEntryLinks.sourceId, id),
          eq(worldEntryLinks.targetId, id)
        )
      )
      .run();
    tx.delete(worldEntries).where(eq(worldEntries.id, id)).run();
  });
}
