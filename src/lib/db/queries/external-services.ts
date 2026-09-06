import { and, eq, isNull } from 'drizzle-orm';

import type { DB } from '@/lib/db';
import { externalServiceSettings } from '@/lib/db/schema';

export type ExternalServiceType =
  | 'tag-recommender'
  | 'lora-training'
  | 'embedding'
  | 'web-search';

export async function getExternalService(
  db: DB,
  serviceType: ExternalServiceType,
  projectId?: string | null
) {
  const rows = db
    .select()
    .from(externalServiceSettings)
    .where(
      and(
        eq(externalServiceSettings.serviceType, serviceType),
        projectId
          ? eq(externalServiceSettings.projectId, projectId)
          : isNull(externalServiceSettings.projectId)
      )
    )
    .all();

  return rows[0] ?? undefined;
}

export async function setExternalService(
  db: DB,
  data: {
    serviceType: ExternalServiceType;
    projectId?: string | null;
    baseUrl: string;
  }
) {
  const existing = await getExternalService(
    db,
    data.serviceType,
    data.projectId
  );

  if (existing) {
    const rows = db
      .update(externalServiceSettings)
      .set({ baseUrl: data.baseUrl, updatedAt: new Date() })
      .where(eq(externalServiceSettings.id, existing.id))
      .returning()
      .all();
    return rows[0];
  }

  const rows = db
    .insert(externalServiceSettings)
    .values({
      projectId: data.projectId ?? null,
      serviceType: data.serviceType,
      baseUrl: data.baseUrl,
    })
    .returning()
    .all();
  return rows[0];
}
