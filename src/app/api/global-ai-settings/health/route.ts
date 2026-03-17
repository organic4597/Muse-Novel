import { NextResponse } from 'next/server';

import { decryptApiKey } from '@/lib/ai/encryption';
import { checkProviderHealth } from '@/lib/ai/health-check';
import type { ProviderType } from '@/lib/ai/types';
import { db } from '@/lib/db';
import {
  listGlobalProviders,
} from '@/lib/db/queries/ai-settings';

const VALID_PROVIDER_TYPES: ProviderType[] = [
  'ollama',
  'nvidia',
  'openai',
  'anthropic',
  'koboldcpp',
  'qwen-local',
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const providerTypeParam = searchParams.get('providerType');
  const baseUrlParam = searchParams.get('baseUrl');
  const apiKeyParam = searchParams.get('apiKey');

  if (!providerTypeParam) {
    return NextResponse.json(
      { error: 'providerType 파라미터가 필요합니다' },
      { status: 400 }
    );
  }

  if (!VALID_PROVIDER_TYPES.includes(providerTypeParam as ProviderType)) {
    return NextResponse.json(
      { error: `잘못된 providerType: ${providerTypeParam}` },
      { status: 400 }
    );
  }

  const providerType = providerTypeParam as ProviderType;

  let resolvedBaseUrl = baseUrlParam ?? '';
  let resolvedApiKey = apiKeyParam ?? '';

  if (!resolvedBaseUrl || !resolvedApiKey) {
    const providers = await listGlobalProviders(db);
    const stored = providers.find((provider) => provider.providerType === providerType);

    if (stored) {
      if (!resolvedBaseUrl && stored.baseUrl) {
        resolvedBaseUrl = stored.baseUrl;
      }

      if (!resolvedApiKey && stored.apiKeyEncrypted) {
        resolvedApiKey = decryptApiKey(stored.apiKeyEncrypted);
      }
    }
  }

  const result = await checkProviderHealth(providerType, {
    baseUrl: resolvedBaseUrl,
    apiKey: resolvedApiKey,
  });

  return NextResponse.json(result);
}
