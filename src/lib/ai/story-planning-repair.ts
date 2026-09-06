import type {
  StoryPlanningCharacter,
  StoryPlanningDraft,
  StoryPlanningMessage,
  StoryPlanningPhase,
  StoryPlanningWorldEntry,
} from './story-planning-types';
import { PHASE_ORDER } from './story-planning-types';

export const LEGACY_WORLD_ARTIFACT_TITLE = '잊혀진 바다신전';

const SKIP_SIGNAL = /^(패스|스킵|넘어가|넘어가자|이것도 패스|이것도 스킵|ㄴㄴ|없어)$/u;
const ADVANCE_SIGNAL = /^(다음|계속|다음 단계|다음 단계로|넘어가|넘어가자|패스|스킵|ㄴㄴ|없어)[.!?~\s]*$/u;
const PREMISE_SIGNAL = /(핵심 갈등|최종 목표|목표는|목적은|결말|귀환|분리|포기|자유|정체성|희생|선택|실패하면|대가는)/u;
const GENRE_HINTS = [
  '현대 판타지',
  '다크 판타지',
  '로맨스 판타지',
  '게임 시스템',
  '판타지',
  '로맨스',
  '미스터리',
  '스릴러',
  '무협',
  '회귀',
  '귀환자',
  '헌터',
  'SF',
] as const;

function normalizeIdentity(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
}

function mergeByIdentity<T>(
  existing: T[],
  incoming: T[],
  getIdentity: (value: T) => string
): T[] {
  const result = [...existing];
  const indexes = new Map(
    result.map((value, index) => [normalizeIdentity(getIdentity(value)), index])
  );

  for (const value of incoming) {
    const identity = normalizeIdentity(getIdentity(value));
    if (!identity) continue;

    const index = indexes.get(identity);
    if (index === undefined) {
      indexes.set(identity, result.length);
      result.push(value);
      continue;
    }
    result[index] = value;
  }

  return result;
}

function mergeStringList(existing: string[] = [], incoming: string[] = []) {
  const seen = new Set<string>();
  return [...existing, ...incoming].filter((value) => {
    const normalized = normalizeIdentity(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function getNextStoryPlanningPhase(
  currentPhase: StoryPlanningPhase
): StoryPlanningPhase {
  const index = PHASE_ORDER.indexOf(currentPhase);
  return index >= 0 && index < PHASE_ORDER.length - 1
    ? PHASE_ORDER[index + 1]
    : currentPhase;
}

export function isExplicitPlanningAdvance(userText: string): boolean {
  return ADVANCE_SIGNAL.test(userText.trim());
}

function inferTitle(userText: string): string | undefined {
  const trimmed = userText.trim();
  const explicit = trimmed.match(
    /(?:제목(?:은|은요|은 그냥)?\s*)(["'“”‘’]?)(.+?)\1(?:으로 해줘|로 해줘|로 하자|로 할게|로 정해줘|로 정하자|이야|입니다)?$/u
  );
  if (explicit?.[2]) {
    const candidate = explicit[2].trim();
    if (candidate.length > 1 && candidate.length <= 80 && !/(추천|몇 개|알아서|정해)/u.test(candidate)) {
      return candidate;
    }
  }

  const quoted = trimmed.match(/["“”‘’']([^"“”‘’']{2,80})["“”‘’']/u);
  return quoted?.[1] && /제목/u.test(trimmed) ? quoted[1].trim() : undefined;
}

function inferGenreAdditions(userText: string, currentPhase: StoryPlanningPhase) {
  const additions = [
    ...Array.from(
      userText.matchAll(
        /([\p{L}\p{N}+/-]+)\s*(?:태그\s*)?(?:넣어줘|넣고|추가해줘|추가하자)/gu
      )
    ).map((match) => match[1]?.trim()),
  ].filter((value): value is string => Boolean(value));

  if (currentPhase === 'genre_tone' || /장르/u.test(userText)) {
    for (const genre of GENRE_HINTS) {
      if (userText.includes(genre)) additions.push(genre);
    }
  }

  return mergeStringList([], additions);
}

function shouldCapturePremise(userText: string, draft: StoryPlanningDraft) {
  if ((draft.currentPhase ?? 'genre_tone') !== 'premise') return false;
  const normalized = userText.trim();
  if (normalized.length < 8 || SKIP_SIGNAL.test(normalized)) return false;
  return !draft.premise?.trim() || PREMISE_SIGNAL.test(normalized);
}

export function applyUserIntentToDraft(
  userText: string,
  draft: StoryPlanningDraft
): StoryPlanningDraft {
  const currentPhase = draft.currentPhase ?? 'genre_tone';
  const nextDraft: StoryPlanningDraft = {
    ...draft,
    themes: [...(draft.themes ?? [])],
    characters: [...draft.characters],
    worldEntries: [...draft.worldEntries],
    pendingCharacters: draft.pendingCharacters
      ? [...draft.pendingCharacters]
      : undefined,
    pendingWorldEntries: draft.pendingWorldEntries
      ? [...draft.pendingWorldEntries]
      : undefined,
    currentPhase,
  };

  const title = inferTitle(userText);
  if (title) nextDraft.title = title;

  const normalizedUserText = userText.trim();
  if (
    !nextDraft.brainDump?.trim() &&
    currentPhase === 'genre_tone' &&
    normalizedUserText.length >= 8 &&
    !isExplicitPlanningAdvance(normalizedUserText)
  ) {
    nextDraft.brainDump = normalizedUserText;
  }

  const genreAdditions = inferGenreAdditions(userText, currentPhase);
  if (genreAdditions.length > 0) {
    const genres = nextDraft.genre
      ? nextDraft.genre.split(/[,/|·]+/u).map((value) => value.trim())
      : [];
    nextDraft.genre = mergeStringList(genres, genreAdditions).join(', ');
  }

  if (shouldCapturePremise(userText, nextDraft)) {
    nextDraft.premise = userText.trim();
  }

  if (isExplicitPlanningAdvance(userText)) {
    nextDraft.currentPhase = getNextStoryPlanningPhase(currentPhase);
  }

  return nextDraft;
}

export function repairStoryPlanningDraft(
  parsedDraft: StoryPlanningDraft,
  previousDraft: StoryPlanningDraft,
  userText: string
): StoryPlanningDraft {
  const previousPhase = previousDraft.currentPhase ?? 'genre_tone';
  const mergedDraft: StoryPlanningDraft = {
    ...previousDraft,
    ...parsedDraft,
    brainDump: previousDraft.brainDump ?? parsedDraft.brainDump,
    themes: mergeStringList(previousDraft.themes, parsedDraft.themes),
    characters: mergeByIdentity<StoryPlanningCharacter>(
      previousDraft.characters,
      parsedDraft.characters,
      (character) => character.name
    ),
    worldEntries: mergeByIdentity<StoryPlanningWorldEntry>(
      previousDraft.worldEntries,
      parsedDraft.worldEntries,
      (entry) => entry.title
    ),
    pendingCharacters: mergeByIdentity<StoryPlanningCharacter>(
      previousDraft.pendingCharacters ?? [],
      parsedDraft.pendingCharacters ?? [],
      (character) => character.name
    ),
    pendingWorldEntries: mergeByIdentity<StoryPlanningWorldEntry>(
      previousDraft.pendingWorldEntries ?? [],
      parsedDraft.pendingWorldEntries ?? [],
      (entry) => entry.title
    ),
  };
  const repairedDraft = applyUserIntentToDraft(userText, mergedDraft);

  if (previousDraft.brainDump?.trim()) {
    repairedDraft.brainDump = previousDraft.brainDump;
  } else if (
    previousPhase === 'genre_tone' &&
    userText.trim().length >= 8 &&
    !isExplicitPlanningAdvance(userText)
  ) {
    repairedDraft.brainDump = userText.trim();
  }

  // If the model already moved one phase, do not apply the same user command twice.
  if (isExplicitPlanningAdvance(userText)) {
    const parsedPhase = mergedDraft.currentPhase ?? previousPhase;
    repairedDraft.currentPhase = parsedPhase !== previousPhase
      ? parsedPhase
      : getNextStoryPlanningPhase(previousPhase);
  }

  if (repairedDraft.pendingCharacters?.length === 0) {
    repairedDraft.pendingCharacters = undefined;
  }
  if (repairedDraft.pendingWorldEntries?.length === 0) {
    repairedDraft.pendingWorldEntries = undefined;
  }

  return repairedDraft;
}

function removeLegacyArtifactFromDraft(
  draft: StoryPlanningDraft
): StoryPlanningDraft {
  const pendingWorldEntries = draft.pendingWorldEntries?.filter(
    (entry) => entry.title !== LEGACY_WORLD_ARTIFACT_TITLE
  );

  return {
    ...draft,
    worldEntries: draft.worldEntries.filter(
      (entry) => entry.title !== LEGACY_WORLD_ARTIFACT_TITLE
    ),
    pendingWorldEntries: pendingWorldEntries && pendingWorldEntries.length > 0
      ? pendingWorldEntries
      : undefined,
  };
}

export function migrateLegacyStoryPlanningSession(
  messages: StoryPlanningMessage[],
  draft: StoryPlanningDraft
): {
  changed: boolean;
  messages: StoryPlanningMessage[];
  draft: StoryPlanningDraft;
} {
  const wasUserAuthored = messages.some(
    (message) =>
      message.role === 'user' &&
      message.content.includes(LEGACY_WORLD_ARTIFACT_TITLE)
  );
  const containsArtifact =
    draft.worldEntries.some(
      (entry) => entry.title === LEGACY_WORLD_ARTIFACT_TITLE
    ) ||
    (draft.pendingWorldEntries ?? []).some(
      (entry) => entry.title === LEGACY_WORLD_ARTIFACT_TITLE
    );

  if (wasUserAuthored || !containsArtifact) {
    return { changed: false, messages, draft };
  }

  return {
    changed: true,
    draft: removeLegacyArtifactFromDraft(draft),
    messages: messages.map((message) => ({
      ...message,
      content:
        message.role === 'assistant'
          ? message.content.replaceAll(
              LEGACY_WORLD_ARTIFACT_TITLE,
              '[삭제된 자동 생성 세계관 항목]'
            )
          : message.content,
      draftSnapshot: message.draftSnapshot
        ? removeLegacyArtifactFromDraft(message.draftSnapshot)
        : undefined,
    })),
  };
}
