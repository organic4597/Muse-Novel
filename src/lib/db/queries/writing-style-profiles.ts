import { asc, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';

import { projects, writingStyleProfiles } from '../schema';

export type WritingStyleProfile = typeof writingStyleProfiles.$inferSelect;

/** List all global writing style profiles (no project filter). */
export async function listAllWritingStyleProfiles(db: DB) {
  return db
    .select()
    .from(writingStyleProfiles)
    .orderBy(asc(writingStyleProfiles.createdAt))
    .all();
}

/** @deprecated Use listAllWritingStyleProfiles. Kept for gradual migration. */
export async function listWritingStyleProfiles(db: DB, _projectId?: string) {
  return listAllWritingStyleProfiles(db);
}

export async function getWritingStyleProfile(db: DB, profileId: string) {
  const rows = db
    .select()
    .from(writingStyleProfiles)
    .where(eq(writingStyleProfiles.id, profileId))
    .all();
  return rows[0] ?? undefined;
}

/**
 * Get the writing style profile assigned to a project via
 * projects.activeWritingStyleProfileId.
 */
export async function getActiveWritingStyleProfile(db: DB, projectId: string) {
  const rows = db
    .select({
      profile: writingStyleProfiles,
    })
    .from(projects)
    .innerJoin(
      writingStyleProfiles,
      eq(projects.activeWritingStyleProfileId, writingStyleProfiles.id)
    )
    .where(eq(projects.id, projectId))
    .all();
  return rows[0]?.profile ?? undefined;
}

export async function createWritingStyleProfile(
  db: DB,
  name: string,
  /** @deprecated no longer required; kept for API compat */
  _projectId?: string
) {
  const rows = db
    .insert(writingStyleProfiles)
    .values({
      name,
      projectId: null,
      filePath: null,
      description: null,
    })
    .returning()
    .all();
  return rows[0];
}

export async function updateWritingStyleProfile(
  db: DB,
  profileId: string,
  data: Partial<{
    name: string;
    filePath: string | null;
    description: string | null;
  }>
) {
  const rows = db
    .update(writingStyleProfiles)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(writingStyleProfiles.id, profileId))
    .returning()
    .all();
  return rows[0] ?? undefined;
}

/**
 * Assign a global writing style profile to a project.
 * Pass null to clear the assignment.
 */
export async function assignStyleProfileToProject(
  db: DB,
  projectId: string,
  profileId: string | null
) {
  const rows = db
    .update(projects)
    .set({ activeWritingStyleProfileId: profileId, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning()
    .all();
  return rows[0] ?? undefined;
}

/** @deprecated Use assignStyleProfileToProject. */
export async function activateWritingStyleProfile(
  db: DB,
  projectId: string,
  profileId: string
) {
  return assignStyleProfileToProject(db, projectId, profileId);
}

export async function deleteWritingStyleProfile(db: DB, profileId: string) {
  // Clear assignment from any project first
  db.update(projects)
    .set({ activeWritingStyleProfileId: null })
    .where(eq(projects.activeWritingStyleProfileId, profileId))
    .run();

  db.delete(writingStyleProfiles)
    .where(eq(writingStyleProfiles.id, profileId))
    .run();
}
