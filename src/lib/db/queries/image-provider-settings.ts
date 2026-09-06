import { and, eq } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import { imageProviderSettings } from '../schema';

type SetImageProviderData = {
  providerType: string;
  baseUrl?: string;
  modelName?: string;
  isDefault?: boolean;
  defaultWidth?: number;
  defaultHeight?: number;
  defaultSteps?: number;
  defaultSampler?: string;
  defaultCfgScale?: number;
  defaultNegativePrompt?: string;
};

type UpdateImageProviderData = Partial<SetImageProviderData>;

export async function getDefaultImageProvider(db: DB, projectId: string) {
  const rows = db
    .select()
    .from(imageProviderSettings)
    .where(
      and(
        eq(imageProviderSettings.projectId, projectId),
        eq(imageProviderSettings.isDefault, 1)
      )
    )
    .all();

  return rows[0] ?? undefined;
}

export async function setImageProvider(
  db: DB,
  projectId: string,
  data: SetImageProviderData
) {
  if (data.isDefault) {
    db.update(imageProviderSettings)
      .set({ isDefault: 0, updatedAt: new Date() })
      .where(
        and(
          eq(imageProviderSettings.projectId, projectId),
          eq(imageProviderSettings.isDefault, 1)
        )
      )
      .run();
  }

  const rows = db
    .insert(imageProviderSettings)
    .values({
      projectId,
      providerType: data.providerType,
      baseUrl: data.baseUrl ?? null,
      modelName: data.modelName ?? null,
      isDefault: data.isDefault ? 1 : 0,
      defaultWidth: data.defaultWidth ?? 512,
      defaultHeight: data.defaultHeight ?? 512,
      defaultSteps: data.defaultSteps ?? 20,
      defaultSampler: data.defaultSampler ?? 'Euler a',
      defaultCfgScale: data.defaultCfgScale ?? 7,
      defaultNegativePrompt: data.defaultNegativePrompt ?? null,
    })
    .returning()
    .all();

  return rows[0];
}

export async function listImageProviders(db: DB, projectId: string) {
  return db
    .select()
    .from(imageProviderSettings)
    .where(eq(imageProviderSettings.projectId, projectId))
    .all();
}

export async function updateImageProvider(
  db: DB,
  id: string,
  data: UpdateImageProviderData
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.providerType !== undefined) updateData.providerType = data.providerType;
  if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl;
  if (data.modelName !== undefined) updateData.modelName = data.modelName;
  if (data.isDefault !== undefined) updateData.isDefault = data.isDefault ? 1 : 0;
  if (data.defaultWidth !== undefined) updateData.defaultWidth = data.defaultWidth;
  if (data.defaultHeight !== undefined) updateData.defaultHeight = data.defaultHeight;
  if (data.defaultSteps !== undefined) updateData.defaultSteps = data.defaultSteps;
  if (data.defaultSampler !== undefined) updateData.defaultSampler = data.defaultSampler;
  if (data.defaultCfgScale !== undefined) updateData.defaultCfgScale = data.defaultCfgScale;
  if (data.defaultNegativePrompt !== undefined) updateData.defaultNegativePrompt = data.defaultNegativePrompt;

  const rows = db
    .update(imageProviderSettings)
    .set(updateData)
    .where(eq(imageProviderSettings.id, id))
    .returning()
    .all();

  return rows[0] ?? undefined;
}

export async function deleteImageProvider(db: DB, id: string) {
  db.delete(imageProviderSettings)
    .where(eq(imageProviderSettings.id, id))
    .run();
}
