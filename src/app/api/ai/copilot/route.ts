import { generateText } from 'ai';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { buildStoryContext } from '@/lib/ai/build-story-context';
import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import {
  buildInlineCompletionSystemPrompt,
  buildInlineCompletionUserPrompt,
  cacheInlineCompletion,
  getCachedInlineCompletion,
  getInlineCompletionCacheKey,
  normalizeInlineCompletion,
} from '@/lib/ai/inline-completion';
import {
  buildNovelWritingSystemPrompt,
  formatPromptData,
} from '@/lib/ai/prompt-foundations';
import { getNovelSystemPrompt } from '@/lib/ai/prompts';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import type { ProviderConfig } from '@/lib/ai/types';
import { isGhostProviderType, isLocalGhostBaseUrl } from '@/lib/ai/ghost-provider-policy';
import { db } from '@/lib/db';
import {
  getDefaultProvider,
  getGlobalDefaultProvider,
} from '@/lib/db/queries/ai-settings';
import { getGhostAISettings } from '@/lib/db/queries/ghost-ai-settings';
import { getProject } from '@/lib/db/queries/projects';
import { getWritingWorkbenchContext } from '@/lib/db/queries/writing-workbench';
import { reserveGhostRequest } from '@/lib/ai/ghost-request-limit';
import { getActiveWritingStyleProfile } from '@/lib/db/queries/writing-style-profiles';

const requestSchema = z.object({
  mode: z.string().optional(),
  projectId: z.string().min(1).optional(),
  chapterId: z.string().nullable().optional(),
  sceneId: z.string().uuid().nullable().optional(),
  prompt: z.string().default(''),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  trigger: z.enum(['automatic', 'explicit']).optional(),
  system: z.string().optional(),
  maxOutputTokens: z.number().positive().optional(),
  temperature: z.number().min(0).max(1.5).optional(),
});

function clampTemperature(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.min(value ?? fallback, 0.9));
}

async function hasAvailableLocalModelSlot(rootUrl: string, signal: AbortSignal) {
  try {
    const response = await fetch(`${rootUrl}/slots?fail_on_no_slot=1`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1200)]),
    });
    return response.status !== 503;
  } catch {
    return false;
  }
}

async function generateInlineCompletion({
  req,
  projectId,
  chapterId,
  sceneId,
  prefix,
  suffix,
  explicit,
  requestedTemperature,
  providerConfig,
  providerId,
  model,
  genre,
}: {
  req: NextRequest;
  projectId: string;
  chapterId?: string | null;
  sceneId?: string | null;
  prefix: string;
  suffix: string;
  explicit: boolean;
  requestedTemperature?: number;
  providerConfig: ProviderConfig;
  providerId: string;
  model: ReturnType<typeof createProvider>;
  genre?: string | null;
}) {
  const startedAt = Date.now();
  const boundedPrefix = prefix.slice(explicit ? -6000 : -1600);
  const boundedSuffix = suffix.slice(0, explicit ? 1500 : 400);
  if (boundedPrefix.trim().length < (explicit ? 4 : 15)) {
    return NextResponse.json({ text: '', status: 'empty', latencyMs: 0 });
  }

  const localRootUrl = providerConfig.provider === 'qwen-local'
    ? (providerConfig.baseUrl || 'http://127.0.0.1:8321')
        .replace(/\/v1\/?$/, '')
        .replace(/\/+$/, '')
    : null;
  if (
    !explicit &&
    localRootUrl &&
    !(await hasAvailableLocalModelSlot(localRootUrl, req.signal))
  ) {
    return NextResponse.json({
      text: '',
      skipped: 'model_busy',
      status: 'model_busy',
      latencyMs: Date.now() - startedAt,
    });
  }

  const [storyContext, activeProfile] = await Promise.all([
    buildStoryContext(
      db,
      projectId,
      chapterId ?? undefined,
      {
        focusText: `${boundedPrefix}\n${boundedSuffix}`,
        maxChars: explicit ? 1400 : 700,
      }
    ).catch(() => ''),
    Promise.resolve(getActiveWritingStyleProfile(db, projectId)).catch(
      () => undefined
    ),
  ]);

  const confirmedScene = sceneId ? getWritingWorkbenchContext(db, projectId, { chapterId: chapterId ?? undefined, sceneId, compact: true }).scene : '';
  const cacheKey = getInlineCompletionCacheKey({
    providerId,
    projectId,
    chapterId: chapterId ?? undefined,
    prefix: boundedPrefix,
    suffix: boundedSuffix,
    context: `${confirmedScene}\n${storyContext}\n${activeProfile?.description ?? ''}`,
  });
  if (!explicit) {
    const cached = getCachedInlineCompletion(cacheKey);
    if (cached) {
      return NextResponse.json({
        text: cached,
        cached: true,
        status: 'success',
        latencyMs: 0,
      });
    }
  }

  const inlineInput = {
    prefix: boundedPrefix,
    suffix: boundedSuffix,
    storyContext: [confirmedScene, storyContext].filter(Boolean).join('\n').slice(0, explicit ? 1800 : 1000),
    styleDescription: activeProfile?.description?.slice(0, explicit ? 1200 : 500),
    genre,
    explicit,
  };
  const temperature = clampTemperature(
    requestedTemperature,
    explicit ? 0.4 : 0.3
  );

  let rawText = '';
  let finishReason: string | undefined;
  if (providerConfig.provider === 'qwen-local') {
    const response = await fetch(`${localRootUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(providerConfig.apiKey ? { Authorization: `Bearer ${providerConfig.apiKey}` } : {}) },
      body: JSON.stringify({
        model: providerConfig.modelId,
        messages: [
          {
            role: 'system',
            content: buildInlineCompletionSystemPrompt(inlineInput),
          },
          {
            role: 'user',
            content: buildInlineCompletionUserPrompt(inlineInput),
          },
        ],
        max_tokens: explicit ? 96 : 64,
        temperature,
        repeat_penalty: 1.08,
        top_k: 32,
        top_p: 0.9,
        min_p: 0.03,
        chat_template_kwargs: { enable_thinking: false },
        stop: ['\n\n', '[커서', '[출력]', '<CURSOR>'],
      }),
      signal: req.signal,
    });
    if (!response.ok) {
      return NextResponse.json({
        text: '',
        status: 'error',
        latencyMs: Date.now() - startedAt,
      });
    }
    const data = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string };
        text?: string;
      }>;
    };
    rawText = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
    finishReason = data.choices?.[0]?.finish_reason;
  } else {
    const result = await generateText({
      abortSignal: req.signal,
      maxOutputTokens: explicit ? 96 : 64,
      model,
      prompt: buildInlineCompletionUserPrompt(inlineInput),
      providerOptions: getProviderOptions(providerConfig),
      system: buildInlineCompletionSystemPrompt(inlineInput),
      temperature,
    });
    rawText = result.text;
    finishReason = result.finishReason;
  }

  let text = normalizeInlineCompletion(rawText, inlineInput);
  if (
    finishReason === 'length' &&
    text &&
    !/[.!?…。！？]["'”’」』)]*\s*$/u.test(text)
  ) {
    text = '';
  }
  if (text && !explicit) cacheInlineCompletion(cacheKey, text);
  return NextResponse.json({
    text,
    cached: false,
    status: text ? 'success' : 'empty',
    latencyMs: Date.now() - startedAt,
  });
}

export async function POST(req: NextRequest) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const {
    mode,
    projectId,
    chapterId,
    sceneId,
    prompt,
    prefix,
    suffix = '',
    trigger,
    system,
    maxOutputTokens: requestedMaxOutputTokens,
    temperature: requestedTemperature,
  } = parsed.data;

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const project = await getProject(db, projectId);
    if (!project) return NextResponse.json({ text: '' });

    const isInlineSuggestion = mode === 'inline-suggestion';
    const ghostSettings = isInlineSuggestion
      ? await getGhostAISettings(db, projectId)
      : undefined;
    if (isInlineSuggestion && !ghostSettings) {
      return NextResponse.json({ text: '', skipped: 'not_configured', status: 'not_configured' });
    }
    if (
      isInlineSuggestion && ghostSettings &&
      (!isGhostProviderType(ghostSettings.providerType) ||
        !ghostSettings.baseUrl || !isLocalGhostBaseUrl(ghostSettings.baseUrl))
    ) {
      return NextResponse.json({ text: '', skipped: 'unsupported_provider', status: 'unsupported_provider' });
    }
    const providerSettings = ghostSettings ??
      await getDefaultProvider(db, projectId) ??
      await getGlobalDefaultProvider(db);
    let providerConfig: ProviderConfig;
    let providerId: string;

    if (providerSettings) {
      providerConfig = resolveStoredProviderConfig(providerSettings, {
        decryptApiKey,
      });
      providerId = ghostSettings
        ? `ghost:${projectId}:${ghostSettings.updatedAt?.getTime() ?? 0}`
        : providerSettings.id;
    } else {
      const envConfig = getEnvProviderConfig();
      if (!envConfig) return NextResponse.json({ text: '' });
      providerConfig = envConfig;
      providerId = `env:${envConfig.provider}:${envConfig.modelId}`;
    }
    const model = createProvider(providerConfig);

    if (isInlineSuggestion) {
      const release = reserveGhostRequest(projectId);
      if (!release) return NextResponse.json({ text: '', skipped: 'rate_limited', status: 'rate_limited' });
      try { return await generateInlineCompletion({
        req,
        projectId,
        chapterId,
        sceneId,
        prefix: prefix ?? prompt,
        suffix,
        explicit: trigger === 'explicit',
        requestedTemperature,
        providerConfig,
        providerId,
        model,
        genre: project.genre,
      }); } finally { release(); }
    }

    let storyContext = '';
    try {
      storyContext = await buildStoryContext(
        db,
        projectId,
        chapterId ?? undefined
      );
    } catch {}

    const activeProfile = await getActiveWritingStyleProfile(db, projectId);
    let systemPrompt = storyContext
      ? buildNovelWritingSystemPrompt({
          storyContext,
          styleDescription: activeProfile?.description,
          additionalInstruction: system,
        })
      : getNovelSystemPrompt(project, [], []);

    if (!storyContext && activeProfile?.description) {
      systemPrompt = `${systemPrompt}\n\n${formatPromptData(
        'style_guide',
        activeProfile.description
      )}`;
    }

    if (!storyContext && system) {
      systemPrompt = `${systemPrompt}\n\n${formatPromptData(
        'additional_instruction',
        system
      )}`;
    }

    const result = await generateText({
      abortSignal: req.signal,
      maxOutputTokens:
        requestedMaxOutputTokens && Number.isFinite(requestedMaxOutputTokens)
          ? Math.min(Math.trunc(requestedMaxOutputTokens), 64)
          : 20,
      model,
      prompt,
      providerOptions: getProviderOptions(providerConfig),
      system: systemPrompt,
      temperature: 0.7,
      ...(providerConfig.provider === 'qwen-local'
        ? { presencePenalty: 0.4, topP: 0.8 }
        : {}),
    });

    return NextResponse.json({ text: result.text });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(null, { status: 408 });
    }
    console.warn('[copilot] AI error:', error);
    return NextResponse.json({ text: '' });
  }
}
