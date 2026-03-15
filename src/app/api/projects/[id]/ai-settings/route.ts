import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { encryptApiKey, maskApiKey } from '@/lib/ai/encryption';
import type { ProviderType } from '@/lib/ai/types';
import { db } from '@/lib/db';
import {
  listGlobalProviders,
  listProviders,
  setProvider,
  updateProvider,
} from '@/lib/db/queries/ai-settings';
import { aiProviderSettings } from '@/lib/db/schema';

const VALID_PROVIDER_TYPES: ProviderType[] = [
  'ollama',
  'nvidia',
  'openai',
  'anthropic',
  'koboldcpp',
  'qwen-local',
];

function maskProviderKeys<
  T extends { apiKeyEncrypted: string | null },
>(providers: T[]) {
  return providers.map((p) => ({
    ...p,
    apiKeyEncrypted: p.apiKeyEncrypted ? maskApiKey(p.apiKeyEncrypted) : null,
  }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const projectProviders = await listProviders(db, projectId);
  const globalProviders = await listGlobalProviders(db);

  // Merge: project-specific providers take priority, global providers fill gaps
  const projectTypes = new Set(projectProviders.map((p) => p.providerType));
  const fallbackGlobals = globalProviders.filter(
    (g) => !projectTypes.has(g.providerType)
  );
  const merged = [...projectProviders, ...fallbackGlobals];

  return NextResponse.json(maskProviderKeys(merged));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();

  const { providerType, modelName, apiKey, baseUrl, isDefault, contextSize } = body;

  // Validate required fields
  if (!providerType || !modelName) {
    return NextResponse.json(
      { error: 'Missing required fields: providerType, modelName' },
      { status: 400 }
    );
  }

  // Validate provider type
  if (!VALID_PROVIDER_TYPES.includes(providerType)) {
    return NextResponse.json(
      {
        error: `Invalid providerType: ${providerType}. Must be one of: ${VALID_PROVIDER_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // Encrypt the API key before saving
  const apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : undefined;

  const created = await setProvider(db, projectId, {
    providerType,
    modelName,
    apiKeyEncrypted,
    baseUrl: baseUrl ?? undefined,
    isDefault: isDefault ?? false,
    contextSize: contextSize ?? undefined,
  });

  return NextResponse.json(
    maskProviderKeys([created])[0],
    { status: 201 }
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();

  const { id, providerType, modelName, apiKey, baseUrl, isDefault, contextSize } = body;

  if (!id) {
    return NextResponse.json(
      { error: 'Missing required field: id' },
      { status: 400 }
    );
  }

  // If isDefault is true, unset other defaults for this project first
  if (isDefault) {
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

  // Build update data
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
  if (isDefault !== undefined) updateData.isDefault = isDefault;
  if (contextSize !== undefined) updateData.contextSize = contextSize;

  // Only encrypt and update API key if a new (non-masked) key is provided
  if (apiKey && !apiKey.includes('****')) {
    updateData.apiKeyEncrypted = encryptApiKey(apiKey);
  }

  const updated = await updateProvider(db, id, updateData);

  if (!updated) {
    return NextResponse.json(
      { error: 'Provider not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(maskProviderKeys([updated])[0]);
}
