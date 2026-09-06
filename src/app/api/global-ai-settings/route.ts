import { NextResponse } from 'next/server';

import { encryptApiKey, maskApiKey } from '@/lib/ai/encryption';
import { PROVIDER_TYPES, type ProviderType } from '@/lib/ai/types';
import { db } from '@/lib/db';
import {
  deleteProvider,
  getGlobalDefaultProvider,
  listGlobalProviders,
  setGlobalProvider,
  updateProvider,
} from '@/lib/db/queries/ai-settings';

const VALID_PROVIDER_TYPES: readonly ProviderType[] = PROVIDER_TYPES;

function maskProviderKeys<T extends { apiKeyEncrypted: string | null }>(providers: T[]) {
  return providers.map((provider) => ({
    ...provider,
    apiKeyEncrypted: provider.apiKeyEncrypted ? maskApiKey(provider.apiKeyEncrypted) : null,
  }));
}

export async function GET() {
  try {
    const providers = await listGlobalProviders(db);
    const defaultProvider = await getGlobalDefaultProvider(db);
    return NextResponse.json({
      providers: maskProviderKeys(providers),
      defaultId: defaultProvider?.id ?? null,
    });
  } catch (error) {
    console.error('[global-ai-settings] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { providerType, modelName, apiKey, baseUrl, contextSize, isDefault } = body;

    if (!providerType || !modelName) {
      return NextResponse.json({ error: 'providerType과 modelName은 필수입니다.' }, { status: 400 });
    }

    if (!VALID_PROVIDER_TYPES.includes(providerType)) {
      return NextResponse.json({ error: `잘못된 providerType: ${providerType}` }, { status: 400 });
    }

    const apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : undefined;

    const provider = await setGlobalProvider(db, {
      providerType,
      modelName,
      apiKeyEncrypted,
      baseUrl,
      contextSize,
      isDefault: isDefault ?? true,
    });

    return NextResponse.json(maskProviderKeys([provider])[0]);
  } catch (error) {
    console.error('[global-ai-settings] POST error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      apiKey,
      providerType,
      modelName,
      baseUrl,
      contextSize,
      isDefault,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

    if (providerType !== undefined && !VALID_PROVIDER_TYPES.includes(providerType)) {
      return NextResponse.json({ error: `잘못된 providerType: ${providerType}` }, { status: 400 });
    }

    const updateData: {
      providerType?: string;
      modelName?: string;
      apiKeyEncrypted?: string;
      baseUrl?: string;
      isDefault?: boolean;
      contextSize?: number;
    } = {};

    if (providerType !== undefined) updateData.providerType = providerType;
    if (modelName !== undefined) updateData.modelName = modelName;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (contextSize !== undefined) updateData.contextSize = contextSize;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (apiKey && !apiKey.includes('****')) {
      updateData.apiKeyEncrypted = encryptApiKey(apiKey);
    }

    const updated = await updateProvider(db, id, updateData);
    return NextResponse.json(updated ? maskProviderKeys([updated])[0] : updated);
  } catch (error) {
    console.error('[global-ai-settings] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

    await deleteProvider(db, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[global-ai-settings] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete settings' }, { status: 500 });
  }
}
