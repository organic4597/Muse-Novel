import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import type { ProviderConfig } from '@/lib/ai/types';
import type { DB } from '@/lib/db';
import {
  getDefaultProvider,
  getGlobalDefaultProvider,
} from '@/lib/db/queries/ai-settings';
import { getProject } from '@/lib/db/queries/projects';

export async function resolveProjectProvider(
  db: DB,
  projectId: string
): Promise<ProviderConfig | null> {
  const project = await getProject(db, projectId);
  if (!project) return null;

  const stored =
    (await getDefaultProvider(db, projectId)) ??
    (await getGlobalDefaultProvider(db));
  if (stored) {
    return resolveStoredProviderConfig(stored, { decryptApiKey });
  }
  return getEnvProviderConfig();
}

