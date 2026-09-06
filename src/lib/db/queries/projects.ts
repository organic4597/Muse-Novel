import { desc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import {
  aiProviderSettings,
  chapters,
  characterEmotions,
  characterImages,
  characterRelationships,
  characters,
  externalServiceSettings,
  imageProviderSettings,
  projects,
  worldEntries,
  worldEntryLinks,
  worldEntryTags,
  worldMaps,
  writingStyleProfiles,
} from '../schema';

type CreateProjectData = {
  title: string;
  genre?: string;
  synopsis?: string;
  settingsJson?: string;
  writingStyleSample?: string;
  writingStyleDescription?: string;
};

type UpdateProjectData = {
  title?: string;
  genre?: string | null;
  synopsis?: string | null;
  settingsJson?: string | null;
  writingStyleSample?: string | null;
  writingStyleDescription?: string | null;
};

export async function createProject(db: DB, data: CreateProjectData) {
  const rows = db
    .insert(projects)
    .values({
      title: data.title,
      genre: data.genre ?? null,
      synopsis: data.synopsis ?? null,
      settingsJson: data.settingsJson ?? null,
      writingStyleSample: data.writingStyleSample ?? null,
      writingStyleDescription: data.writingStyleDescription ?? null,
    })
    .returning()
    .all();

  return rows[0];
}

export async function getProject(db: DB, id: string) {
  const rows = db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .all();

  return rows[0] ?? undefined;
}

export async function listProjects(db: DB) {
  return db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .all();
}

/**
 * The home library only renders card metadata. Keep the large planning and
 * writing-style columns out of the initial RSC payload and SQLite result.
 */
export async function listProjectSummaries(db: DB) {
  return db
    .select({
      id: projects.id,
      title: projects.title,
      genre: projects.genre,
      synopsis: projects.synopsis,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .all();
}

export async function updateProject(
  db: DB,
  id: string,
  data: UpdateProjectData
) {
  const rows = db
    .update(projects)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function deleteProject(db: DB, id: string) {
  const mapImages = db.select({ imagePath: worldMaps.imagePath, image2xPath: worldMaps.image2xPath, thumbnailPath: worldMaps.thumbnailPath })
    .from(worldMaps).where(eq(worldMaps.projectId, id)).all();
  // 1. Get chapter and character ids for this project
  const projectChapters = db
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.projectId, id))
    .all();
  const projectCharacters = db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.projectId, id))
    .all();
  const projectWorldEntries = db
    .select({ id: worldEntries.id })
    .from(worldEntries)
    .where(eq(worldEntries.projectId, id))
    .all();

  // 2. Delete leaf tables first (characterEmotions references chapters + characters)
  for (const chapter of projectChapters) {
    db.delete(characterEmotions).where(eq(characterEmotions.chapterId, chapter.id)).run();
  }
  for (const character of projectCharacters) {
    db.delete(characterEmotions).where(eq(characterEmotions.characterId, character.id)).run();
    db.delete(characterRelationships).where(eq(characterRelationships.characterAId, character.id)).run();
    db.delete(characterRelationships).where(eq(characterRelationships.characterBId, character.id)).run();
  }
  for (const entry of projectWorldEntries) {
    db.delete(worldEntryTags).where(eq(worldEntryTags.entryId, entry.id)).run();
    db.delete(worldEntryLinks).where(eq(worldEntryLinks.sourceId, entry.id)).run();
    db.delete(worldEntryLinks).where(eq(worldEntryLinks.targetId, entry.id)).run();
  }

  // 3. Delete owned tables
  db.delete(characterImages).where(eq(characterImages.projectId, id)).run();
  db.delete(chapters).where(eq(chapters.projectId, id)).run();
  db.delete(characters).where(eq(characters.projectId, id)).run();
  db.delete(worldEntries).where(eq(worldEntries.projectId, id)).run();
  db.delete(aiProviderSettings).where(eq(aiProviderSettings.projectId, id)).run();
  db.delete(imageProviderSettings).where(eq(imageProviderSettings.projectId, id)).run();
  db.delete(writingStyleProfiles).where(eq(writingStyleProfiles.projectId, id)).run();
  db.delete(externalServiceSettings).where(eq(externalServiceSettings.projectId, id)).run();

  // 4. Delete the project
  db.delete(projects).where(eq(projects.id, id)).run();
  return mapImages.flatMap((map) => [map.imagePath, map.image2xPath, map.thumbnailPath]);
}
