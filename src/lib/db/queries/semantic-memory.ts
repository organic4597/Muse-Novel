import { and, eq, inArray } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import { semanticMemoryChunks } from '@/lib/db/schema';

export type SemanticMemoryChunkInput = {
  chunkIndex: number;
  content: string;
  contentHash: string;
  embeddingJson?: string | null;
  embeddingModel?: string | null;
  projectId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  sourceUpdatedAt?: Date | null;
};

export type SemanticMemorySourceReplacement = {
  chunks: SemanticMemoryChunkInput[];
  projectId: string;
  sourceId: string;
  sourceType: string;
};

const MEMORY_INSERT_BATCH_SIZE = 100;

export async function listSemanticMemoryChunks(db: DB, projectId: string) {
  return db
    .select()
    .from(semanticMemoryChunks)
    .where(eq(semanticMemoryChunks.projectId, projectId))
    .all();
}

export async function listSourceMemoryChunks(
  db: DB,
  projectId: string,
  sourceType: string,
  sourceId: string
) {
  return db
    .select()
    .from(semanticMemoryChunks)
    .where(
      and(
        eq(semanticMemoryChunks.projectId, projectId),
        eq(semanticMemoryChunks.sourceType, sourceType),
        eq(semanticMemoryChunks.sourceId, sourceId)
      )
    )
    .all();
}

export async function replaceSourceMemoryChunks(
  db: DB,
  replacement: SemanticMemorySourceReplacement
) {
  return replaceSemanticMemorySources(db, [replacement]);
}

export async function replaceSemanticMemorySources(
  db: DB,
  replacements: SemanticMemorySourceReplacement[]
) {
  if (replacements.length === 0) return;

  const deleteSource = (tx: DB, replacement: SemanticMemorySourceReplacement) =>
    tx
      .delete(semanticMemoryChunks)
      .where(
        and(
          eq(semanticMemoryChunks.projectId, replacement.projectId),
          eq(semanticMemoryChunks.sourceType, replacement.sourceType),
          eq(semanticMemoryChunks.sourceId, replacement.sourceId)
        )
      )
      .run();
  const chunks = replacements.flatMap((replacement) => replacement.chunks);

  if (process.env.DATABASE_PROVIDER === 'turso') {
    await db.transaction(async (tx) => {
      for (const replacement of replacements) {
        await Promise.resolve(deleteSource(tx as DB, replacement));
      }
      for (let offset = 0; offset < chunks.length; offset += MEMORY_INSERT_BATCH_SIZE) {
        await Promise.resolve(
          tx
            .insert(semanticMemoryChunks)
            .values(chunks.slice(offset, offset + MEMORY_INSERT_BATCH_SIZE))
            .run()
        );
      }
    });
    return;
  }

  // better-sqlite3 transactions must remain synchronous. Awaiting the outer
  // result still gives callers one completion contract across both drivers.
  await Promise.resolve(
    db.transaction((tx) => {
      for (const replacement of replacements) {
        deleteSource(tx as DB, replacement);
      }
      for (let offset = 0; offset < chunks.length; offset += MEMORY_INSERT_BATCH_SIZE) {
        tx
          .insert(semanticMemoryChunks)
          .values(chunks.slice(offset, offset + MEMORY_INSERT_BATCH_SIZE))
          .run();
      }
    })
  );
}

export async function deleteStaleMemorySources(
  db: DB,
  projectId: string,
  activeSourceKeys: string[]
) {
  const rows = await listSemanticMemoryChunks(db, projectId);
  const activeKeys = new Set(activeSourceKeys);
  const staleRows = rows.filter(
    (row) => !activeKeys.has(`${row.sourceType}:${row.sourceId}`)
  );
  const staleIds = staleRows.map((row) => row.id);

  for (let offset = 0; offset < staleIds.length; offset += 200) {
    const batch = staleIds.slice(offset, offset + 200);
    await Promise.resolve(
      db
        .delete(semanticMemoryChunks)
        .where(inArray(semanticMemoryChunks.id, batch))
        .run()
    );
  }

  return new Set(
    staleRows.map((row) => `${row.sourceType}:${row.sourceId}`)
  ).size;
}
