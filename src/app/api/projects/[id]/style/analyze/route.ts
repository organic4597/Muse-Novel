import { generateText } from 'ai';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import {
  formatPromptData,
  STYLE_ANALYSIS_SYSTEM_PROMPT,
} from '@/lib/ai/prompt-foundations';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import {
  isAIRequestQueueFullError,
  runAIRequest,
} from '@/lib/ai/request-scheduler';
import type { ProviderConfig } from '@/lib/ai/types';
import { db } from '@/lib/db';
import { getDefaultProvider } from '@/lib/db/queries/ai-settings';
import { getProject, updateProject } from '@/lib/db/queries/projects';

const REQUEST_TIMEOUT_MS = 600_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { sampleText } = (await req.json()) as { sampleText: string };

  if (!sampleText?.trim()) {
    return NextResponse.json({ error: 'sampleText is required' }, { status: 400 });
  }

  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const providerSettings = await getDefaultProvider(db, id);

  let providerConfig: ProviderConfig | null = null;
  let model;
  if (providerSettings) {
    providerConfig = resolveStoredProviderConfig(providerSettings, {
      decryptApiKey,
    });
    model = createProvider(providerConfig);
  } else {
    const envConfig = getEnvProviderConfig();
    if (!envConfig) {
      return NextResponse.json({ error: 'No AI provider configured' }, { status: 503 });
    }
    providerConfig = envConfig;
    model = createProvider(envConfig);
  }

  try {
    const requestSignal = AbortSignal.any([
      req.signal,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]);
    const { text: description } = await runAIRequest(
      providerConfig,
      {
        priority: 'standard',
        projectId: id,
        requestId: req.headers.get('x-request-id') ?? undefined,
        signal: requestSignal,
      },
      (abortSignal) => generateText({
        abortSignal,
        model,
        maxOutputTokens: 200,
        providerOptions: getProviderOptions(providerConfig),
        temperature: 0.3,
        system: STYLE_ANALYSIS_SYSTEM_PROMPT,
        prompt: `다음 소설 텍스트에서 재현 가능한 문체 특징을 추출하세요.\n\n${formatPromptData('sample_text', sampleText.slice(0, 3000))}`,
      })
    );

    await updateProject(db, id, {
      writingStyleSample: sampleText,
      writingStyleDescription: description,
    });

    return NextResponse.json({ description });
  } catch (error) {
    console.warn('[style/analyze] AI error:', error);
    if (isAIRequestQueueFullError(error)) {
      return NextResponse.json(
        { code: 'ai_queue_full', error: error.message },
        {
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
          status: 429,
        }
      );
    }
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }
}
