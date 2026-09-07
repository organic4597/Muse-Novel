import { NextResponse } from 'next/server';
import { z } from 'zod';

import { decryptApiKey, encryptApiKey, maskApiKey } from '@/lib/ai/encryption';
import { PROVIDER_TYPES } from '@/lib/ai/types';
import { db } from '@/lib/db';
import {
  deleteGhostAISettings,
  getGhostAISettings,
  setGhostAISettings,
} from '@/lib/db/queries/ghost-ai-settings';
import { getProject } from '@/lib/db/queries/projects';

const settingsSchema = z.object({
  apiKey: z.string().max(1000).optional(),
  baseUrl: z.string().trim().max(2000).optional(),
  contextSize: z.number().int().min(1024).max(2_000_000).nullable().optional(),
  modelName: z.string().trim().min(1).max(300),
  providerType: z.enum(PROVIDER_TYPES),
});

function maskSettings<T extends { apiKeyEncrypted: string | null }>(value: T) {
  return {
    ...value,
    apiKeyEncrypted: value.apiKeyEncrypted
      ? maskApiKey(decryptApiKey(value.apiKeyEncrypted))
      : null,
  };
}

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  const override = await getGhostAISettings(db, id);
  return NextResponse.json({ override: override ? maskSettings(override) : null });
}

export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ghost Text 제공자 설정을 확인해주세요.' }, { status: 400 });
  }
  const existing = await getGhostAISettings(db, id);
  const freshKey = parsed.data.apiKey && !parsed.data.apiKey.includes('****')
    ? encryptApiKey(parsed.data.apiKey)
    : existing?.apiKeyEncrypted ?? null;
  const saved = await setGhostAISettings(db, id, {
    providerType: parsed.data.providerType,
    modelName: parsed.data.modelName,
    apiKeyEncrypted: freshKey,
    baseUrl: parsed.data.baseUrl || null,
    contextSize: parsed.data.contextSize ?? null,
  });
  return NextResponse.json(maskSettings(saved));
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  await deleteGhostAISettings(db, id);
  return NextResponse.json({ inherited: true });
}
