import { eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import { ghostAiSettings } from '@/lib/db/schema';

export type GhostAISettingsData = {
  apiKeyEncrypted?: string | null;
  baseUrl?: string | null;
  contextSize?: number | null;
  modelName: string;
  providerType: string;
};

export async function getGhostAISettings(db: DB, projectId: string) {
  return db
    .select()
    .from(ghostAiSettings)
    .where(eq(ghostAiSettings.projectId, projectId))
    .get();
}

export async function setGhostAISettings(
  db: DB,
  projectId: string,
  data: GhostAISettingsData
) {
  const now = new Date();
  return db
    .insert(ghostAiSettings)
    .values({
      projectId,
      providerType: data.providerType,
      modelName: data.modelName,
      apiKeyEncrypted: data.apiKeyEncrypted ?? null,
      baseUrl: data.baseUrl ?? null,
      contextSize: data.contextSize ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ghostAiSettings.projectId,
      set: {
        providerType: data.providerType,
        modelName: data.modelName,
        apiKeyEncrypted: data.apiKeyEncrypted ?? null,
        baseUrl: data.baseUrl ?? null,
        contextSize: data.contextSize ?? null,
        updatedAt: now,
      },
    })
    .returning()
    .get();
}

export async function deleteGhostAISettings(db: DB, projectId: string) {
  db.delete(ghostAiSettings)
    .where(eq(ghostAiSettings.projectId, projectId))
    .run();
}
