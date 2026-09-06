import { desc, eq, or } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import {
  characterEmotions,
  characterImages,
  characterRelationships,
  characters,
} from '../schema';
import { captureEntityRevision, type EntityRow } from './entity-revisions';

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

type UpdateCharacterData = { [K in keyof Omit<CreateCharacterData, 'projectId'>]?: K extends 'name' ? string : CreateCharacterData[K] | null } & { imagePath?: string | null };

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
  return db.transaction((tx: DB) => {
    const before = tx.select().from(characters).where(eq(characters.id, id)).get();
    if (!before) return undefined;
    const changes = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    captureEntityRevision(tx, 'character', before as EntityRow, { after: { ...before, ...changes } });
    return tx.update(characters).set({ ...changes, updatedAt: new Date() }).where(eq(characters.id, id)).returning().all()[0];
  }, { behavior: 'immediate' });
}

export async function deleteCharacter(db: DB, id: string) {
  db.transaction((tx) => {
    tx.delete(characterEmotions)
      .where(eq(characterEmotions.characterId, id))
      .run();
    tx.delete(characterRelationships)
      .where(
        or(
          eq(characterRelationships.characterAId, id),
          eq(characterRelationships.characterBId, id)
        )
      )
      .run();
    tx.delete(characterImages)
      .where(eq(characterImages.characterId, id))
      .run();
    tx.delete(characters).where(eq(characters.id, id)).run();
  });
}
