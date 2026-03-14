import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { decryptApiKey } from '@/lib/ai/encryption';
import { checkProviderHealth } from '@/lib/ai/health-check';
import type { ProviderType } from '@/lib/ai/types';
import { listProviders } from '@/lib/db/queries/ai-settings';

const VALID_PROVIDER_TYPES: ProviderType[] = [
  'ollama',
  'nvidia',
  'openai',
  'anthropic',
  'koboldcpp',
  'qwen-local',
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
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

  // Resolve baseUrl and apiKey: prefer query params, fall back to stored settings
  let resolvedBaseUrl = baseUrlParam ?? '';
  let resolvedApiKey = apiKeyParam ?? '';

  if (!resolvedBaseUrl || !resolvedApiKey) {
    const providers = await listProviders(db, projectId);
    const stored = providers.find((p) => p.providerType === providerType);
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
