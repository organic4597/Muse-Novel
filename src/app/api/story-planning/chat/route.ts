import { generateText, streamText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import {
  isAIRequestQueueFullError,
  runAIRequest,
} from '@/lib/ai/request-scheduler';
import {
  buildStoryPlanningOptions,
  buildStoryPlanningPhaseFollowUp,
} from '@/lib/ai/story-planning-phase-config';
import {
  buildStoryPlanningMessages,
  extractStoryPlanningReplyPreview,
  isPhaseComplete,
  parseStoryPlanningResponse,
} from '@/lib/ai/story-planning-prompt';
import {
  getNextStoryPlanningPhase,
  isExplicitPlanningAdvance,
  migrateLegacyStoryPlanningSession,
  repairStoryPlanningDraft,
} from '@/lib/ai/story-planning-repair';
import type { StoryPlanningDraft, StoryPlanningMessage, StoryPlanningPhase } from '@/lib/ai/story-planning-types';
import { EMPTY_DRAFT, PHASE_LABELS } from '@/lib/ai/story-planning-types';
import type { ProviderConfig } from '@/lib/ai/types';
import { db } from '@/lib/db';
import { getGlobalDefaultProvider } from '@/lib/db/queries/ai-settings';
import { buildWritingKnowledgeContext } from '@/lib/knowledge/writing-knowledge';
import { formatWebResearch, researchForRequest } from '@/lib/web-research/research';
import { WEB_SEARCH_MODES } from '@/lib/web-research/types';

const optionalText = z.string().trim().max(20_000).optional();
const characterItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  status: z.string().trim().max(100).optional(),
});
const characterSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: optionalText,
  appearance: optionalText,
  personality: optionalText,
  backstory: optionalText,
  arcDescription: optionalText,
  items: z.array(characterItemSchema).max(100).optional(),
});
const worldEntrySchema = z.object({
  category: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  content: optionalText,
});
const draftSchema = z.object({
  brainDump: optionalText,
  title: optionalText,
  genre: optionalText,
  synopsis: optionalText,
  premise: optionalText,
  storyPromise: optionalText,
  tone: optionalText,
  themes: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  characters: z.array(characterSchema).max(500).default([]),
  worldEntries: z.array(worldEntrySchema).max(500).default([]),
  firstChapterOutline: optionalText,
  endingDirection: optionalText,
  pendingCharacters: z.array(characterSchema).max(500).optional(),
  pendingWorldEntries: z.array(worldEntrySchema).max(500).optional(),
  currentPhase: z.enum([
    'genre_tone',
    'premise',
    'characters',
    'world',
    'plot',
    'writing_setup',
    'complete',
  ]).optional(),
  pointOfView: optionalText,
  narrativeTense: optionalText,
  writingStyle: optionalText,
  formatGoal: optionalText,
  targetAudience: optionalText,
  contentBoundaries: optionalText,
  authorNote: optionalText,
  plotStructure: optionalText,
});
const storyPlanningRequestSchema = z.object({
  webSearchMode: z.enum(WEB_SEARCH_MODES).default('auto'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(20_000),
    options: z.array(z.string().max(500)).max(12).optional(),
    draftSnapshot: draftSchema.optional(),
  })).min(1).max(200),
  draft: draftSchema.optional(),
});

function hasPremiseLikeAnswer(userText: string) {
  return /(핵심 갈등|최종 목표|목표는|목적은|결말|귀환|분리|포기|자유|정체성|희생|선택)/.test(
    userText
  );
}

function buildFallbackReply(
  previousDraft: StoryPlanningDraft,
  repairedDraft: StoryPlanningDraft
) {
  const previousPhase = previousDraft.currentPhase ?? 'genre_tone';
  const nextPhase = repairedDraft.currentPhase ?? previousPhase;
  const phaseLabel = PHASE_LABELS[nextPhase] ?? nextPhase;
  const followUp = buildStoryPlanningPhaseFollowUp(nextPhase, repairedDraft);

  if (nextPhase !== previousPhase) {
    return `말씀하신 내용을 기획에 반영했습니다. 이제 ${phaseLabel} 단계로 이어갈게요.\n\n${followUp}`;
  }

  return `말씀하신 내용을 기획에 반영했습니다.\n\n${followUp}`;
}

function selectFallbackReply(
  rawReply: string,
  previousDraft: StoryPlanningDraft,
  repairedDraft: StoryPlanningDraft,
  userText: string
) {
  const cleanedReply = rawReply.trim();
  const previousPhase = previousDraft.currentPhase ?? 'genre_tone';
  const nextPhase = repairedDraft.currentPhase ?? previousPhase;

  if (!cleanedReply) {
    return buildFallbackReply(previousDraft, repairedDraft);
  }

  const normalizedReply = cleanedReply.replace(/\s+/g, ' ');
  const userAnsweredPremise = hasPremiseLikeAnswer(userText);
  const repeatsPremiseQuestion =
    nextPhase === 'premise' &&
    /(핵심 갈등|최종 목표).*(정리해볼까요|한 줄로|무엇으로|뭘로)/.test(normalizedReply) &&
    userAnsweredPremise;

  const genericQuestionOnly =
    normalizedReply.length < 90 &&
    /(정리해볼까요|무엇인가요\??|어떤.*가시겠습니까\??|조금 더 정해볼까요\??)/.test(
      normalizedReply
    );

  if (repeatsPremiseQuestion || genericQuestionOnly) {
    return buildFallbackReply(previousDraft, repairedDraft);
  }

  return cleanedReply;
}

function computeOverlapRatio(a: string, b: string): number {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length === 0) return 0;

  const windowSize = Math.min(20, shorter.length);
  let matchingChars = 0;

  for (let i = 0; i <= shorter.length - windowSize; i += windowSize) {
    const chunk = shorter.slice(i, i + windowSize);
    if (longer.includes(chunk)) {
      matchingChars += windowSize;
    }
  }

  return matchingChars / shorter.length;
}

async function resolveProvider(): Promise<ProviderConfig | null> {
  // 1. Global AI settings (projectId IS NULL)
  const globalSetting = await getGlobalDefaultProvider(db);
  if (globalSetting) {
    return {
      provider: globalSetting.providerType as ProviderConfig['provider'],
      modelId: globalSetting.modelName ?? '',
      apiKey: globalSetting.apiKeyEncrypted
        ? decryptApiKey(globalSetting.apiKeyEncrypted)
        : undefined,
      baseUrl: globalSetting.baseUrl ?? undefined,
      contextSize: globalSetting.contextSize ?? undefined,
    };
  }

  // 2. Env variable fallback
  return getEnvProviderConfig();
}

class StoryPlanningOutputTruncatedError extends Error {
  override name = 'StoryPlanningOutputTruncatedError';
}

function finalizeStoryPlanningText(
  text: string,
  messages: StoryPlanningMessage[],
  currentDraft: StoryPlanningDraft,
  lastMsg: StoryPlanningMessage
) {
  const stagedPhase: StoryPlanningPhase = currentDraft.currentPhase ?? 'genre_tone';
  const parsed = parseStoryPlanningResponse(text, currentDraft, {
    stagedPhase,
  });

  let repairedDraft = lastMsg.content
    ? repairStoryPlanningDraft(parsed.draft, currentDraft, lastMsg.content)
    : parsed.draft;

  const migratedResponse = migrateLegacyStoryPlanningSession(
    [...messages, { role: 'assistant', content: parsed.reply }],
    repairedDraft
  );
  repairedDraft = migratedResponse.draft;
  const safeParsedReply =
    migratedResponse.messages.at(-1)?.content ?? parsed.reply;

  let repairedPhase = repairedDraft.currentPhase ?? 'genre_tone';
  const expectedNextPhase = getNextStoryPlanningPhase(stagedPhase);
  const mayAdvance =
    isExplicitPlanningAdvance(lastMsg.content) ||
    isPhaseComplete(stagedPhase, repairedDraft);

  if (
    repairedPhase !== stagedPhase &&
    (repairedPhase !== expectedNextPhase || !mayAdvance)
  ) {
    console.warn('[story-planning/chat] Rejected premature phase advancement', {
      from: stagedPhase,
      attempted: repairedPhase,
    });
    repairedDraft = { ...repairedDraft, currentPhase: stagedPhase };
    repairedPhase = stagedPhase;
  }

  if (
    repairedPhase === stagedPhase &&
    isPhaseComplete(stagedPhase, repairedDraft) &&
    stagedPhase !== 'complete'
  ) {
    const forcedNext = getNextStoryPlanningPhase(stagedPhase);
    if (forcedNext !== stagedPhase) {
      console.info('[story-planning/chat] Forcing phase advancement', {
        from: stagedPhase,
        to: forcedNext,
      });
      repairedDraft = { ...repairedDraft, currentPhase: forcedNext };
    }
  }

  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const lastAssistantReply = assistantMessages.at(-1)?.content ?? '';
  const replyForComparison = safeParsedReply.replace(/\s+/g, ' ').trim();
  const lastReplyForComparison = lastAssistantReply.replace(/\s+/g, ' ').trim();
  const isRepetitiveReply =
    replyForComparison.length > 30 &&
    lastReplyForComparison.length > 30 &&
    (replyForComparison === lastReplyForComparison ||
      computeOverlapRatio(replyForComparison, lastReplyForComparison) > 0.8);

  if (isRepetitiveReply) {
    console.warn('[story-planning/chat] Repetitive reply detected', {
      phase: repairedDraft.currentPhase ?? 'genre_tone',
    });
  }

  let repairedReply: string;
  if (parsed.debug?.mode === 'fallback' && lastMsg.content) {
    repairedReply = selectFallbackReply(
      safeParsedReply,
      currentDraft,
      repairedDraft,
      lastMsg.content
    );
  } else if (isRepetitiveReply && lastMsg.content) {
    repairedReply = buildFallbackReply(currentDraft, repairedDraft);
  } else {
    repairedReply = safeParsedReply;
  }

  if (parsed.debug?.mode === 'fallback') {
    console.warn('[story-planning/chat] Parser fallback detected', {
      currentPhase: currentDraft.currentPhase,
      rawTextPreview: parsed.debug.rawTextPreview,
      candidateCount: parsed.debug.candidateCount,
      userMessage: lastMsg.content.slice(0, 200),
    });
  }

  return {
    reply: repairedReply,
    draft: repairedDraft,
    options: parsed.options && parsed.options.length > 0
      ? parsed.options
      : buildStoryPlanningOptions(repairedDraft),
  };
}

function getStoryPlanningError(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  const isOutputTruncated = error instanceof StoryPlanningOutputTruncatedError;
  const isQueueFull = isAIRequestQueueFullError(error);
  const isTimeout =
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError');

  return {
    detail,
    error: isQueueFull
      ? 'ai_queue_full'
      : isOutputTruncated
        ? 'output_truncated'
        : isTimeout
          ? 'request_timeout'
          : 'AI 응답 중 오류가 발생했습니다.',
    message: isQueueFull
      ? error.message
      : isOutputTruncated
        ? 'AI 응답이 길이 제한으로 완성되지 않아 설정에 반영하지 않았습니다. 입력 내용은 복원했으니 다시 시도해주세요.'
        : isTimeout
          ? 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
          : undefined,
    ...(isQueueFull ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    status: isQueueFull ? 429 : isOutputTruncated ? 502 : isTimeout ? 504 : 500,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const validated = storyPlanningRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          message: '스토리 구상 요청 형식이 올바르지 않습니다.',
        },
        { status: 400 }
      );
    }

    let messages: StoryPlanningMessage[] = validated.data.messages;
    let currentDraft: StoryPlanningDraft = validated.data.draft ?? EMPTY_DRAFT;
    const migratedRequest = migrateLegacyStoryPlanningSession(messages, currentDraft);
    messages = migratedRequest.messages;
    currentDraft = migratedRequest.draft;

    const lastMsg = messages.at(-1);
    if (!lastMsg || lastMsg.role !== 'user') {
      return NextResponse.json(
        { error: '마지막 메시지는 user 역할이어야 합니다.' },
        { status: 400 }
      );
    }

    const providerConfig = await resolveProvider();
    if (!providerConfig) {
      return NextResponse.json(
      { error: 'no_provider', message: 'AI 설정이 필요합니다. 스토리 구상용 AI 설정을 먼저 구성해주세요.' },
        { status: 422 }
      );
    }

    if (!providerConfig.modelId.trim()) {
      return NextResponse.json(
        {
          error: 'invalid_provider_config',
          message: '스토리 구상용 AI 설정에 모델명이 없습니다. AI 설정을 확인해주세요.',
        },
        { status: 422 }
      );
    }

    const model = createProvider(providerConfig);
    const writingReference = buildWritingKnowledgeContext(
      [
        currentDraft.genre ?? '',
        currentDraft.currentPhase ?? 'genre_tone',
        lastMsg.content,
      ].filter(Boolean).join(' '),
      2200
    );
    const aiMessages = buildStoryPlanningMessages(
      messages,
      currentDraft,
      writingReference
    );

    const streamAbortController = new AbortController();
    let streamClosed = false;
    const requestSignal = AbortSignal.any([
      request.signal,
      streamAbortController.signal,
      AbortSignal.timeout(600_000),
    ]);
    const requestId = request.headers.get('x-request-id') ?? undefined;
    const generationOptions = {
      model,
      messages: aiMessages,
      maxOutputTokens: 4000,
      providerOptions: getProviderOptions(providerConfig, {
        disableReasoning: providerConfig.provider === 'qwen-local',
      }),
      temperature: 0.7,
      ...(providerConfig.provider === 'qwen-local'
        ? { presencePenalty: 0.4, topP: 0.8 }
        : {}),
    };

    const prepareResearch = async (onStatus?: (message: string) => void) => {
      const research = await researchForRequest({
        instruction: lastMsg.content,
        providerConfig,
        mode: validated.data.webSearchMode,
        signal: requestSignal,
        onStatus,
      });
      generationOptions.messages = buildStoryPlanningMessages(
        messages, currentDraft, [writingReference, formatWebResearch(research)].filter(Boolean).join('\n\n')
      );
      return research;
    };

    const wantsStream = request.headers.get('accept')?.includes('text/event-stream');
    if (wantsStream) {
      const encoder = new TextEncoder();
      const responseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const sendEvent = (event: string, payload: Record<string, unknown>) => {
            if (streamClosed) return;
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
              );
            } catch {
              streamClosed = true;
              streamAbortController.abort();
            }
          };

          try {
            const research = await prepareResearch((message) => sendEvent('status', { message }));
            sendEvent('status', { message: '답변을 구성하는 중...' });
            await runAIRequest(
              providerConfig,
              {
                onQueued: (position) => {
                  sendEvent('status', {
                    message: '다른 AI 작업이 끝나기를 기다리는 중...',
                    position,
                  });
                },
                priority: 'interactive',
                requestId,
                signal: requestSignal,
              },
              async (abortSignal) => {
                const result = streamText({
                  ...generationOptions,
                  abortSignal,
                });
                let rawText = '';
                let visibleReply = '';
                let finishReason: string | undefined;

                for await (const part of result.fullStream) {
                  if (part.type === 'error') throw part.error;
                  if (part.type === 'abort') {
                    throw new DOMException('Story planning request aborted', 'AbortError');
                  }
                  if (part.type === 'finish' || part.type === 'finish-step') {
                    finishReason = part.finishReason;
                  }
                  if (part.type !== 'text-delta') continue;

                  rawText += part.text;
                  const preview = extractStoryPlanningReplyPreview(rawText);
                  if (preview === undefined || preview === visibleReply) continue;

                  if (preview.startsWith(visibleReply)) {
                    sendEvent('delta', { text: preview.slice(visibleReply.length) });
                  } else {
                    sendEvent('replace', { text: preview });
                  }
                  visibleReply = preview;
                }

                if (!rawText.trim()) {
                  throw new Error('AI가 빈 응답을 반환했습니다.');
                }
                if (finishReason === 'length') {
                  throw new StoryPlanningOutputTruncatedError(
                    'Story planning output reached maxOutputTokens.'
                  );
                }

                sendEvent(
                  'done',
                  { ...finalizeStoryPlanningText(rawText, messages, currentDraft, lastMsg), research }
                );
              }
            );
          } catch (error) {
            console.error('[story-planning/chat] Stream error:', error);
            const streamError = getStoryPlanningError(error);
            sendEvent('error', streamError);
          } finally {
            if (!streamClosed) {
              streamClosed = true;
              controller.close();
            }
          }
        },
        cancel() {
          streamClosed = true;
          streamAbortController.abort();
        },
      });

      return new Response(responseStream, {
        headers: {
          'Cache-Control': 'no-cache, no-transform',
          'Content-Type': 'text/event-stream; charset=utf-8',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const research = await prepareResearch();
    const { finishReason, text } = await runAIRequest(
      providerConfig,
      {
        priority: 'interactive',
        requestId,
        signal: requestSignal,
      },
      (abortSignal) => generateText({
        ...generationOptions,
        abortSignal,
      })
    );
    if (finishReason === 'length') {
      throw new StoryPlanningOutputTruncatedError(
        'Story planning output reached maxOutputTokens.'
      );
    }
    return NextResponse.json(
      { ...finalizeStoryPlanningText(text, messages, currentDraft, lastMsg), research }
    );
  } catch (error) {
    console.error('[story-planning/chat] Error:', error);
    const requestError = getStoryPlanningError(error);
    return NextResponse.json(requestError, {
      ...(requestError.status === 429 && 'retryAfterSeconds' in requestError
        ? {
            headers: {
              'Retry-After': String(requestError.retryAfterSeconds),
            },
          }
        : {}),
      status: requestError.status,
    });
  }
}
