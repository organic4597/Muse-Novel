import { and, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import { aiProviderSettings } from '@/lib/db/schema';

type SetProviderData = {
  providerType: string;
  modelName: string;
  apiKeyEncrypted?: string;
  baseUrl?: string;
  isDefault?: boolean;
  contextSize?: number;
};

type UpdateProviderData = Partial<
  Omit<SetProviderData, 'isDefault'> & { isDefault: boolean }
>;

/** Returns the provider setting where isDefault=1 for a project, or undefined. */
export async function getDefaultProvider(db: DB, projectId: string) {
  const rows = db
    .select()
    .from(aiProviderSettings)
    .where(
      and(
        eq(aiProviderSettings.projectId, projectId),
        eq(aiProviderSettings.isDefault, 1)
      )
    )
    .all();

  return rows[0] ?? undefined;
}

/** Inserts a new provider setting. If isDefault=true, unsets other defaults first. */
export async function setProvider(
  db: DB,
  projectId: string,
  data: SetProviderData
) {
  if (data.isDefault) {
    // Unset other defaults for this project
    db.update(aiProviderSettings)
      .set({ isDefault: 0, updatedAt: new Date() })
      .where(
        and(
          eq(aiProviderSettings.projectId, projectId),
          eq(aiProviderSettings.isDefault, 1)
        )
      )
      .run();
  }

  const rows = db
    .insert(aiProviderSettings)
    .values({
      projectId,
      providerType: data.providerType,
      modelName: data.modelName,
      apiKeyEncrypted: data.apiKeyEncrypted ?? null,
      baseUrl: data.baseUrl ?? null,
      contextSize: data.contextSize ?? null,
      isDefault: data.isDefault ? 1 : 0,
    })
    .returning()
    .all();

  return rows[0];
}

/** Returns all provider settings for a project. */
export async function listProviders(db: DB, projectId: string) {
  return db
    .select()
    .from(aiProviderSettings)
    .where(eq(aiProviderSettings.projectId, projectId))
    .all();
}

/** Updates a provider setting by id. Returns the updated row or undefined. */
export async function updateProvider(
  db: DB,
  id: string,
  data: UpdateProviderData
) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.providerType !== undefined) {
    updateData.providerType = data.providerType;
  }
  if (data.modelName !== undefined) {
    updateData.modelName = data.modelName;
  }
  if (data.apiKeyEncrypted !== undefined) {
    updateData.apiKeyEncrypted = data.apiKeyEncrypted;
  }
  if (data.baseUrl !== undefined) {
    updateData.baseUrl = data.baseUrl;
  }
  if (data.contextSize !== undefined) {
    updateData.contextSize = data.contextSize;
  }
  if (data.isDefault !== undefined) {
    updateData.isDefault = data.isDefault ? 1 : 0;
  }

  const rows = db
    .update(aiProviderSettings)
    .set(updateData)
    .where(eq(aiProviderSettings.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

/** Deletes a provider setting by id. */
export async function deleteProvider(db: DB, id: string) {
  db.delete(aiProviderSettings).where(eq(aiProviderSettings.id, id)).run();
}
