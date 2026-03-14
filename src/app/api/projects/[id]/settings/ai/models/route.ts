import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { listOllamaModelOptions } from '@/lib/ai/ollama-model-metadata';
import { listProviders } from '@/lib/db/queries/ai-settings';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);

  // baseUrl can be supplied via query param or read from stored settings
  const baseUrlParam = searchParams.get('baseUrl');

  let baseUrl = baseUrlParam ?? '';

  if (!baseUrl) {
    const providers = await listProviders(db, projectId);
    const stored = providers.find((p) => p.providerType === 'ollama');
    if (stored?.baseUrl) {
      baseUrl = stored.baseUrl;
    }
  }

  if (!baseUrl) {
    baseUrl = 'http://localhost:11434';
  }

  try {
    const models = await listOllamaModelOptions(baseUrl);
    return NextResponse.json({ models });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Ollama에 연결할 수 없습니다: ${message}` },
      { status: 502 }
    );
  }
}
