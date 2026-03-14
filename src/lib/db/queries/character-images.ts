import { and, desc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import { characterImages, characters } from '../schema';

export type ImageKind = 'profile' | 'full-body' | 'illustration';

type CreateCharacterImageData = {
  characterId: string;
  projectId: string;
  imagePath: string;
  kind: ImageKind;
  prompt?: string;
  negativePrompt?: string;
  providerType?: string;
  modelName?: string;
  width?: number;
  height?: number;
  seed?: number;
};

export async function createCharacterImage(db: DB, data: CreateCharacterImageData) {
  const rows = db
    .insert(characterImages)
    .values({
      characterId: data.characterId,
      projectId: data.projectId,
      imagePath: data.imagePath,
      kind: data.kind,
      prompt: data.prompt ?? null,
      negativePrompt: data.negativePrompt ?? null,
      providerType: data.providerType ?? null,
      modelName: data.modelName ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      seed: data.seed ?? null,
      isPrimary: 0,
    })
    .returning()
    .all();

  return rows[0];
}

export async function listCharacterImages(
  db: DB,
  characterId: string,
  kind?: ImageKind
) {
  if (kind) {
    return db
      .select()
      .from(characterImages)
      .where(
        and(
          eq(characterImages.characterId, characterId),
          eq(characterImages.kind, kind)
        )
      )
      .orderBy(desc(characterImages.createdAt))
      .all();
  }

  return db
    .select()
    .from(characterImages)
    .where(eq(characterImages.characterId, characterId))
    .orderBy(desc(characterImages.createdAt))
    .all();
}

export async function getCharacterImage(db: DB, imageId: string) {
  const rows = db
    .select()
    .from(characterImages)
    .where(eq(characterImages.id, imageId))
    .all();

  return rows[0] ?? undefined;
}

/** Set an image as primary for its character, syncing to characters.imagePath */
export async function setPrimaryImage(db: DB, imageId: string) {
  const image = await getCharacterImage(db, imageId);
  if (!image) return undefined;

  // Unset current primary for this character
  db.update(characterImages)
    .set({ isPrimary: 0, updatedAt: new Date() })
    .where(
      and(
        eq(characterImages.characterId, image.characterId),
        eq(characterImages.isPrimary, 1)
      )
    )
    .run();

  // Set new primary
  db.update(characterImages)
    .set({ isPrimary: 1, updatedAt: new Date() })
    .where(eq(characterImages.id, imageId))
    .run();

  // Sync to characters.imagePath
  db.update(characters)
    .set({ imagePath: image.imagePath, updatedAt: new Date() })
    .where(eq(characters.id, image.characterId))
    .run();

  return { ...image, isPrimary: 1 };
}

/** Delete a character image. If it was primary, clears characters.imagePath. */
export async function deleteCharacterImage(db: DB, imageId: string) {
  const image = await getCharacterImage(db, imageId);
  if (!image) return undefined;

  db.delete(characterImages).where(eq(characterImages.id, imageId)).run();

  // If deleted image was primary, clear the character's imagePath
  if (image.isPrimary === 1) {
    db.update(characters)
      .set({ imagePath: null, updatedAt: new Date() })
      .where(eq(characters.id, image.characterId))
      .run();
  }

  return image;
}

/** Delete all images for a character (for character deletion cleanup). */
export async function deleteAllCharacterImages(db: DB, characterId: string) {
  const images = db
    .select()
    .from(characterImages)
    .where(eq(characterImages.characterId, characterId))
    .all();

  db.delete(characterImages)
    .where(eq(characterImages.characterId, characterId))
    .run();

  return images;
}
