import { asc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { loras, projects } from '../schema';

export type Lora = typeof loras.$inferSelect;

export async function listLoras(db: DB, _projectId?: string) {
  return db
    .select()
    .from(loras)
    .orderBy(asc(loras.createdAt))
    .all();
}

export async function getLora(db: DB, id: string) {
  const rows = db.select().from(loras).where(eq(loras.id, id)).all();
  return rows[0] ?? undefined;
}

export async function createLora(
  db: DB,
  data: {
    projectId?: string | null;
    name: string;
    filePath: string;
    sourceDescription?: string | null;
  }
) {
  const rows = db
    .insert(loras)
    .values({
      projectId: data.projectId ?? null,
      name: data.name,
      filePath: data.filePath,
      sourceDescription: data.sourceDescription ?? null,
    })
    .returning()
    .all();
  return rows[0];
}

export async function renameLora(db: DB, id: string, name: string) {
  const rows = db
    .update(loras)
    .set({ name })
    .where(eq(loras.id, id))
    .returning()
    .all();
  return rows[0] ?? undefined;
}

export async function deleteLora(db: DB, id: string) {
  db.delete(loras).where(eq(loras.id, id)).run();
}

/**
 * Set the active LoRA for a project. Pass null to clear.
 */
export async function setActiveLora(
  db: DB,
  projectId: string,
  loraId: string | null
) {
  const rows = db
    .update(projects)
    .set({ activeLoraId: loraId, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning()
    .all();
  return rows[0] ?? undefined;
}
