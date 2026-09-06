import { generateText } from 'ai';
import { readFile } from 'fs/promises';
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
import {
  getWritingStyleProfile,
  updateWritingStyleProfile,
} from '@/lib/db/queries/writing-style-profiles';
import { findExistingUploadPath } from '@/lib/uploads/storage';

const MAX_SAMPLE_CHARS = 8000;
const REQUEST_TIMEOUT_MS = 600_000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;

  // Optional: allow scoping AI provider to a project
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');

  const profile = await getWritingStyleProfile(db, profileId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (!profile.filePath) {
    return NextResponse.json({ error: '먼저 텍스트 파일을 업로드하세요.' }, { status: 400 });
  }

  let sampleText: string;
  try {
    const buf = await readFile(await findExistingUploadPath(profile.filePath));
    sampleText = buf.toString('utf-8');
  } catch {
    return NextResponse.json({ error: '파일을 읽을 수 없습니다.' }, { status: 500 });
  }

  let model;
  let providerConfig: ProviderConfig | null = null;
  if (projectId) {
    const providerSettings = await getDefaultProvider(db, projectId);
    if (providerSettings) {
      providerConfig = resolveStoredProviderConfig(providerSettings, {
        decryptApiKey,
      });
      model = createProvider(providerConfig);
    }
  }

  if (!model || !providerConfig) {
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
        projectId: projectId ?? undefined,
        requestId: req.headers.get('x-request-id') ?? undefined,
        signal: requestSignal,
      },
      (abortSignal) => generateText({
        abortSignal,
        model,
        maxOutputTokens: 300,
        providerOptions: getProviderOptions(providerConfig),
        temperature: 0.3,
        system: STYLE_ANALYSIS_SYSTEM_PROMPT,
        prompt: `다음 소설 텍스트에서 재현 가능한 문체 특징을 추출하세요.\n\n${formatPromptData('sample_text', sampleText.slice(0, MAX_SAMPLE_CHARS))}`,
      })
    );

    const updated = await updateWritingStyleProfile(db, profileId, { description });
    return NextResponse.json({ description, profile: updated });
  } catch (error) {
    console.warn('[style-profiles/analyze] AI error:', error);
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
