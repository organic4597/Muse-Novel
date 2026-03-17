import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import { getServerModelId, isServerRunning } from '@/lib/ai/qwen-server-manager';
import {
  buildStoryPlanningOptions,
  buildStoryPlanningPhaseFollowUp,
  buildStoryPlanningPhaseSummary,
} from '@/lib/ai/story-planning-phase-config';
import { buildStoryPlanningMessages, getNextPhase as getNextPhaseFromPrompt, isPhaseComplete, parseStoryPlanningResponse } from '@/lib/ai/story-planning-prompt';
import type { StoryPlanningDraft, StoryPlanningMessage, StoryPlanningPhase } from '@/lib/ai/story-planning-types';
import { EMPTY_DRAFT, PHASE_LABELS } from '@/lib/ai/story-planning-types';
import type { ProviderConfig } from '@/lib/ai/types';
import { db } from '@/lib/db';
import { getGlobalDefaultProvider } from '@/lib/db/queries/ai-settings';

function normalizeTagList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,/|·]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
  );
}

const PHASE_ORDER = [
  'genre_tone',
  'premise',
  'themes',
  'characters',
  'world',
  'plot',
  'writing_style',
  'first_chapter',
  'complete',
] as const;

function mergeGenreValue(currentGenre: string | undefined, userText: string) {
  const additionMatches = [
    ...userText.matchAll(/([\p{L}\p{N}+/-]+)\s*(?:태그\s*)?(?:넣어줘|넣고|추가해줘|추가하자)/gu),
  ].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));

  if (additionMatches.length === 0) {
    return currentGenre;
  }

  const existing = currentGenre ? normalizeTagList(currentGenre) : [];
  const merged = Array.from(new Set([...existing, ...additionMatches]));
  return merged.join(', ');
}

function detectNextPhase(userText: string, currentPhase: StoryPlanningDraft['currentPhase']) {
  const wantsNext = /(다음|넘어가자|다음 단계|계속)/.test(userText);
  if (!wantsNext) {
    return currentPhase;
  }

  const currentIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : 0;
  if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
    return currentPhase ?? 'genre_tone';
  }

  return PHASE_ORDER[currentIndex + 1];
}

function getNextPhase(currentPhase: StoryPlanningDraft['currentPhase']) {
  const currentIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : 0;
  if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
    return currentPhase ?? 'genre_tone';
  }

  return PHASE_ORDER[currentIndex + 1];
}

function hasPremiseLikeAnswer(userText: string) {
  return /(핵심 갈등|최종 목표|목표는|목적은|결말|귀환|분리|포기|자유|정체성|희생|선택)/.test(
    userText
  );
}

function isSkipSignal(userText: string) {
  return /^(패스|스킵|넘어가|넘어가자|이것도 패스|이것도 스킵|ㄴㄴ|없어)$/u.test(
    userText.trim()
  );
}

function inferTitleFromUserText(userText: string) {
  const trimmed = userText.trim();

  const explicitTitleMatch = trimmed.match(/(?:제목(?:은|은요|은 그냥)?\s*)(["'“”‘’]?)(.+?)\1(?:으로 해줘|로 해줘|로 하자|로 할게|로 정해줘|로 정하자|이야|입니다)?$/u);
  if (explicitTitleMatch?.[2]) {
    const candidate = explicitTitleMatch[2].trim();
    if (candidate.length > 1 && !/(추천|몇 개|알아서|정해)/.test(candidate)) {
      return candidate;
    }
  }

  const quotedTitleMatch = trimmed.match(/["“”‘’']([^"“”‘’']{2,40})["“”‘’']/u);
  if (quotedTitleMatch?.[1] && /제목/.test(trimmed)) {
    return quotedTitleMatch[1].trim();
  }

  return undefined;
}

function inferPhaseFromUserText(
  userText: string,
  draft: StoryPlanningDraft
): StoryPlanningDraft['currentPhase'] {
  const normalized = userText.trim();
  const currentPhase = draft.currentPhase ?? 'genre_tone';

  if (isSkipSignal(normalized)) {
    return getNextPhase(currentPhase);
  }

  if (/(다음|넘어가자|다음 단계|계속)/.test(normalized)) {
    return getNextPhase(currentPhase);
  }

  if (currentPhase === 'genre_tone' && (draft.genre || draft.tone)) {
    return 'premise';
  }

  if (currentPhase === 'premise') {
    if (draft.premise || draft.synopsis) {
      return 'themes';
    }

    if (
      /(사고|이세계|떨어|전이|유물|신전|기생|만났|손을 대|바다신전)/.test(normalized) ||
      hasPremiseLikeAnswer(normalized)
    ) {
      return 'themes';
    }
  }

  if (currentPhase === 'themes' && draft.themes && draft.themes.length > 0) {
    return 'characters';
  }

  if (
    currentPhase === 'characters' &&
    !(draft.pendingCharacters && draft.pendingCharacters.length > 0) &&
    (draft.characters.length > 0 || /(주인공|이름|관계|동료|악역)/.test(normalized))
  ) {
      return 'world';
    }

  if (
    currentPhase === 'world' &&
    !(draft.pendingWorldEntries && draft.pendingWorldEntries.length > 0) &&
    (draft.worldEntries.length > 0 || /(신전|세계관|규칙|마법|조직|역사|장소)/.test(normalized))
  ) {
      return 'plot';
    }

  if (currentPhase === 'plot' && (draft.plotStructure || /(전개|사건|목표|갈등|복수|귀환)/.test(normalized))) {
    return 'writing_style';
  }

  if (currentPhase === 'writing_style' && (draft.pointOfView || draft.writingStyle || draft.formatGoal)) {
    return 'first_chapter';
  }

  return currentPhase;
}

function inferDraftFromUserText(
  userText: string,
  draft: StoryPlanningDraft
) {
  const nextDraft: StoryPlanningDraft = { ...draft };
  const stagedPhase = draft.currentPhase ?? 'genre_tone';
  const inferredTitle = inferTitleFromUserText(userText);

  if (inferredTitle) {
    nextDraft.title = inferredTitle;
  }

  if (!nextDraft.genre) {
    const genreHints = [
      ...userText.matchAll(/(판타지|현대 판타지|다크 판타지|로맨스|무협|먼치킨|게임 시스템|회귀|귀환자|헌터)/g),
    ].map((match) => match[1]);

    if (genreHints.length > 0) {
      nextDraft.genre = Array.from(new Set(genreHints)).join(', ');
    }
  }

  if (!nextDraft.premise && /(사고|이세계|전이|기생|유물|신전|떨어)/.test(userText)) {
    nextDraft.premise = userText.trim();
  }

  if (nextDraft.currentPhase === 'premise' && hasPremiseLikeAnswer(userText)) {
    nextDraft.premise = userText.trim();
  }

  if (
    nextDraft.worldEntries.length === 0 &&
    !(nextDraft.pendingWorldEntries && nextDraft.pendingWorldEntries.length > 0) &&
    /(신전|바다신전|유물|세계관|장소)/.test(userText)
  ) {
    const inferredWorldEntry = {
      category: '장소',
      title: '잊혀진 바다신전',
      content: userText.trim(),
    };

    if (stagedPhase === 'world') {
      nextDraft.worldEntries = [inferredWorldEntry];
    } else {
      nextDraft.pendingWorldEntries = [
        ...(nextDraft.pendingWorldEntries ?? []),
        inferredWorldEntry,
      ];
    }
  }

  const inferredNextPhase = inferPhaseFromUserText(userText, nextDraft);

  if (isSkipSignal(userText.trim())) {
    nextDraft.currentPhase = inferredNextPhase;
    return nextDraft;
  }

  if (stagedPhase === 'genre_tone' && inferredNextPhase === 'premise') {
    nextDraft.currentPhase = inferredNextPhase;
    return nextDraft;
  }

  if (stagedPhase === 'premise' && inferredNextPhase === 'themes') {
    nextDraft.currentPhase = inferredNextPhase;
    return nextDraft;
  }

  if (/(다음|넘어가자|다음 단계|계속)/.test(userText.trim())) {
    nextDraft.currentPhase = inferredNextPhase;
    return nextDraft;
  }

  nextDraft.currentPhase = stagedPhase;
  return nextDraft;
}

function buildFallbackReply(
  previousDraft: StoryPlanningDraft,
  repairedDraft: StoryPlanningDraft,
  userText: string
) {
  const previousPhase = previousDraft.currentPhase ?? 'genre_tone';
  const nextPhase = repairedDraft.currentPhase ?? previousPhase;
  const completedPhase = nextPhase !== previousPhase ? previousPhase : nextPhase;
  const phaseLabel = PHASE_LABELS[nextPhase] ?? nextPhase;
  const summary = buildStoryPlanningPhaseSummary(completedPhase, repairedDraft);
  const acceptedUserText = userText.trim().replace(/\s+/g, ' ');
  const shortAcceptedUserText = acceptedUserText.length > 120
    ? `${acceptedUserText.slice(0, 117)}...`
    : acceptedUserText;

  if (nextPhase !== previousPhase) {
    return `좋아요. 방금 말한 ${shortAcceptedUserText ? `"${shortAcceptedUserText}"` : '내용'}을 반영했어요. ${summary} 이제 ${phaseLabel} 단계로 넘어갈게요. ${buildStoryPlanningPhaseFollowUp(nextPhase, repairedDraft)}`;
  }

  return `좋아요. 방금 말한 ${shortAcceptedUserText ? `"${shortAcceptedUserText}"` : '내용'}을 반영했어요. ${summary} ${buildStoryPlanningPhaseFollowUp(nextPhase, repairedDraft)}`;
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
    return buildFallbackReply(previousDraft, repairedDraft, userText);
  }

  if (nextPhase !== previousPhase) {
    return buildFallbackReply(previousDraft, repairedDraft, userText);
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
    return buildFallbackReply(previousDraft, repairedDraft, userText);
  }

  return cleanedReply;
}

function repairDraftFromUserIntent(
  parsedDraft: StoryPlanningDraft,
  fallbackDraft: StoryPlanningDraft,
  userText: string
) {
  const mergedDraft: StoryPlanningDraft = {
    ...fallbackDraft,
    ...parsedDraft,
    genre: mergeGenreValue(parsedDraft.genre ?? fallbackDraft.genre, userText),
    characters: parsedDraft.characters.length > 0 ? parsedDraft.characters : fallbackDraft.characters,
    worldEntries: parsedDraft.worldEntries.length > 0 ? parsedDraft.worldEntries : fallbackDraft.worldEntries,
  };

  return inferDraftFromUserText(userText, mergedDraft);
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
    if (globalSetting.providerType === 'qwen-local') {
      const running = await isServerRunning(globalSetting.baseUrl ?? undefined);
      const runningModelId = running
        ? await getServerModelId(globalSetting.baseUrl ?? undefined)
        : null;

      return {
        provider: 'qwen-local',
        modelId: runningModelId ?? globalSetting.modelName ?? 'Qwen/Qwen3.5-9B-Base',
        baseUrl: globalSetting.baseUrl ?? undefined,
        contextSize: globalSetting.contextSize ?? undefined,
      };
    }

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages: StoryPlanningMessage[] = body.messages ?? [];
    const currentDraft: StoryPlanningDraft = body.draft ?? EMPTY_DRAFT;

    if (messages.length === 0) {
      return NextResponse.json(
        { error: '메시지가 비어있습니다.' },
        { status: 400 }
      );
    }

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
    const aiMessages = buildStoryPlanningMessages(messages, currentDraft);

    const { text } = await generateText({
      model,
      messages: aiMessages,
      maxOutputTokens: 2000,
      providerOptions: getProviderOptions(providerConfig),
      temperature: 0.7,
    });

    const stagedPhase: StoryPlanningPhase = currentDraft.currentPhase ?? 'genre_tone';
    const parsed = parseStoryPlanningResponse(text, currentDraft, {
      stagedPhase,
    });

    let repairedDraft: StoryPlanningDraft;
    if (lastMsg.content) {
      repairedDraft = repairDraftFromUserIntent(parsed.draft, currentDraft, lastMsg.content);
    } else {
      repairedDraft = parsed.draft;
    }

    const repairedPhase = repairedDraft.currentPhase ?? 'genre_tone';
    if (repairedPhase === stagedPhase && isPhaseComplete(stagedPhase, repairedDraft) && stagedPhase !== 'complete') {
      const forcedNext = getNextPhaseFromPrompt(stagedPhase);
      if (forcedNext !== stagedPhase) {
        console.info('[story-planning/chat] Forcing phase advancement', {
          from: stagedPhase,
          to: forcedNext,
        });
        repairedDraft = { ...repairedDraft, currentPhase: forcedNext };
      }
    }

    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    const lastAssistantReply = assistantMessages.at(-1)?.content ?? '';
    const replyForComparison = parsed.reply.replace(/\s+/g, ' ').trim();
    const lastReplyForComparison = lastAssistantReply.replace(/\s+/g, ' ').trim();
    const isRepetitiveReply =
      replyForComparison.length > 30 &&
      lastReplyForComparison.length > 30 &&
      (replyForComparison === lastReplyForComparison ||
        computeOverlapRatio(replyForComparison, lastReplyForComparison) > 0.8);

    if (isRepetitiveReply && repairedDraft.currentPhase !== 'complete') {
      const currentPhaseNow = repairedDraft.currentPhase ?? 'genre_tone';
      const forcedNext = getNextPhaseFromPrompt(currentPhaseNow);
      if (forcedNext !== currentPhaseNow) {
        console.warn('[story-planning/chat] Repetitive reply detected, forcing phase advancement', {
          from: currentPhaseNow,
          to: forcedNext,
        });
        repairedDraft = { ...repairedDraft, currentPhase: forcedNext };
      }
    }

    let repairedReply: string;
    if (parsed.debug?.mode === 'fallback' && lastMsg.content) {
      repairedReply = selectFallbackReply(parsed.reply, currentDraft, repairedDraft, lastMsg.content);
    } else if (isRepetitiveReply && lastMsg.content) {
      repairedReply = buildFallbackReply(currentDraft, repairedDraft, lastMsg.content);
    } else {
      repairedReply = parsed.reply;
    }

    if (parsed.debug?.mode === 'fallback') {
      console.warn('[story-planning/chat] Parser fallback detected', {
        currentPhase: currentDraft.currentPhase,
        rawTextPreview: parsed.debug.rawTextPreview,
        candidateCount: parsed.debug.candidateCount,
        userMessage: lastMsg.content.slice(0, 200),
      });
    }

    return NextResponse.json({
      reply: repairedReply,
      draft: repairedDraft,
      options: parsed.options && parsed.options.length > 0
        ? parsed.options
        : buildStoryPlanningOptions(repairedDraft),
    });
  } catch (error) {
    console.error('[story-planning/chat] Error:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'AI 응답 중 오류가 발생했습니다.', detail },
      { status: 500 }
    );
  }
}
