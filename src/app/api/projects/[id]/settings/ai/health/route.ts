import { NextResponse } from 'next/server';
import { decryptApiKey } from '@/lib/ai/encryption';
import { checkProviderHealth } from '@/lib/ai/health-check';
import { PROVIDER_TYPES, type ProviderType } from '@/lib/ai/types';
import { db } from '@/lib/db';
import { listProviders } from '@/lib/db/queries/ai-settings';
import { getGhostAISettings } from '@/lib/db/queries/ghost-ai-settings';
import { isGhostProviderType, isLocalGhostBaseUrl } from '@/lib/ai/ghost-provider-policy';

const VALID_PROVIDER_TYPES: readonly ProviderType[] = PROVIDER_TYPES;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);

  const providerTypeParam = searchParams.get('providerType');
  const baseUrlParam = searchParams.get('baseUrl');
  const apiKeyParam = searchParams.get('apiKey');
  const role = searchParams.get('role');

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
  if (role === 'ghost' && !isGhostProviderType(providerType)) {
    return NextResponse.json(
      { status: 'error', message: 'Ghost Text는 로컬 추론 제공자만 사용할 수 있습니다.' },
      { status: 400 }
    );
  }

  // Resolve baseUrl and apiKey: prefer query params, fall back to stored settings
  let resolvedBaseUrl = baseUrlParam ?? '';
  let resolvedApiKey = apiKeyParam ?? '';

  if (!resolvedBaseUrl || !resolvedApiKey) {
    const stored = role === 'ghost'
      ? await getGhostAISettings(db, projectId)
      : (await listProviders(db, projectId)).find(
          (provider) => provider.providerType === providerType
        );
    if (stored) {
      if (!resolvedBaseUrl && stored.baseUrl) {
        resolvedBaseUrl = stored.baseUrl;
      }
      if (!resolvedApiKey && stored.apiKeyEncrypted) {
        resolvedApiKey = decryptApiKey(stored.apiKeyEncrypted);
      }
    }
  }

  if (role === 'ghost' && !isLocalGhostBaseUrl(resolvedBaseUrl)) {
    return NextResponse.json(
      { status: 'error', message: 'Ghost Text Base URL은 로컬 또는 사설망 주소여야 합니다.' },
      { status: 400 }
    );
  }

  const result = await checkProviderHealth(providerType, {
    baseUrl: resolvedBaseUrl,
    apiKey: resolvedApiKey,
  });

  return NextResponse.json(result);
}
