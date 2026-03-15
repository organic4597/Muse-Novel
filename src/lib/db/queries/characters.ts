import { desc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { characters } from '../schema';

type CreateCharacterData = {
  projectId: string;
  name: string;
  role?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  arcDescription?: string;
  itemsJson?: string | null;
};

type UpdateCharacterData = Partial<Omit<CreateCharacterData, 'projectId'> & { imagePath: string | null }>;

export async function createCharacter(db: DB, data: CreateCharacterData) {
  const rows = db
    .insert(characters)
    .values({
      projectId: data.projectId,
      name: data.name,
      role: data.role ?? null,
      appearance: data.appearance ?? null,
      personality: data.personality ?? null,
      backstory: data.backstory ?? null,
      arcDescription: data.arcDescription ?? null,
      itemsJson: data.itemsJson ?? null,
    })
    .returning()
    .all();

  return rows[0];
}

export async function getCharacter(db: DB, id: string) {
  const rows = db
    .select()
    .from(characters)
    .where(eq(characters.id, id))
    .all();

  return rows[0] ?? undefined;
}

export async function listCharacters(db: DB, projectId: string) {
  return db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId))
    .orderBy(desc(characters.createdAt))
    .all();
}

export async function updateCharacter(
  db: DB,
  id: string,
  data: UpdateCharacterData
) {
  const rows = db
    .update(characters)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(characters.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function deleteCharacter(db: DB, id: string) {
  db.delete(characters).where(eq(characters.id, id)).run();
}
