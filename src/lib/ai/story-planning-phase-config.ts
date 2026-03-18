import type { StoryPlanningDraft, StoryPlanningPhase } from './story-planning-types';

type StoryPlanningPhaseConfig = {
  summary: (draft: StoryPlanningDraft) => string;
  question: string;
  followUp: string | ((draft: StoryPlanningDraft) => string);
  options: string[];
  buildContextOptions?: (draft: StoryPlanningDraft) => string[];
};

const STORY_PLANNING_PHASE_CONFIG: Record<StoryPlanningPhase, StoryPlanningPhaseConfig> = {
  genre_tone: {
    summary: (draft) => {
      const parts = [quoteValue(draft.genre), quoteValue(draft.tone)].filter(Boolean);
      return parts.length > 0 ? `장르/톤은 ${parts.join(', ')} 쪽으로 잡혔어요.` : '장르와 분위기 방향을 잡기 시작했어요.';
    },
    question: '먼저 장르와 전체적인 분위기를 어떻게 가져갈지 정해볼까요?',
    followUp: '지금 방향이면 분위기를 더 어둡게 밀지, 감정선을 더 전면에 둘지 정하면 다음 단계로 넘기기 쉬워요. 어느 쪽이 좋나요?',
    options: ['다크 판타지', '현대 판타지', '로맨스 판타지', '미스터리', 'SF'],
    buildContextOptions: (draft) =>
      draft.genre
        ? [`${draft.genre} 톤 더 어둡게 가기`, `${draft.genre} 톤 더 서정적으로 가기`]
        : [],
  },
  premise: {
    summary: (draft) => {
      const premise = quoteValue(draft.premise) ?? quoteValue(draft.synopsis);
      const themePart =
        draft.themes && draft.themes.length > 0
          ? ` 주제는 ${draft.themes.map((t) => `"${t}"`).join(', ')}.`
          : '';
      return premise ? `핵심 전제는 ${premise}로 정리됐어요.${themePart}` : '핵심 전제와 주제를 정리하고 있어요.';
    },
    question: '이 이야기의 핵심 전제나 중심 갈등, 그리고 작품에서 다루고 싶은 주제나 감정선을 함께 이야기해볼까요?',
    followUp: '전제와 주제가 잡혔으면, 주인공의 목표와 실패 대가 중 하나를 더 선명하게 잡으면 다음 단계로 넘기기 쉬워요. 어느 쪽부터 정할까요?',
    options: ['주인공의 목표 정하기', '핵심 갈등 강화하기', '주제 감정선 정하기', '로그라인으로 정리하기'],
    buildContextOptions: (draft) => {
      const contextual: string[] = [];
      if (draft.premise || draft.synopsis) {
        contextual.push('주인공 목표 더 선명하게 하기');
      }
      if (draft.themes && draft.themes.length > 0) {
        contextual.push(`${draft.themes[0]} 갈등 더 강화하기`);
      }
      return contextual;
    },
  },
  characters: {
    summary: (draft) =>
      draft.characters.length > 0
        ? `등장인물은 ${draft.characters.map((character) => character.name).join(', ')} 중심으로 잡혔어요.`
        : '등장인물 구성을 정리하고 있어요.',
    question: '이제 주요 등장인물부터 정해볼까요? 주인공이나 핵심 인물의 역할과 관계를 말해 주세요.',
    followUp: (draft) => {
      const leadCharacter = draft.characters[0]?.name ?? draft.pendingCharacters?.[0]?.name;
      return leadCharacter
        ? `${leadCharacter}를 더 살리려면 관계 축을 먼저 세울지, 결핍을 먼저 정할지 선택하는 편이 좋아요. 어느 쪽으로 갈까요?`
        : '인물 단계에서는 관계 축과 결핍 중 하나를 먼저 세우면 나머지가 빨리 붙어요. 어느 쪽부터 정할까요?';
    },
    options: ['주인공 설정하기', '조연 추가하기', '악역 구상하기', '인물 관계 정리하기'],
    buildContextOptions: (draft) => {
      const contextual: string[] = [];
      if ((draft.pendingCharacters?.length ?? 0) > 0) {
        contextual.push('지금 후보부터 정리하기');
      }

      const leadCharacter = draft.characters[0]?.name ?? draft.pendingCharacters?.[0]?.name;
      if (leadCharacter) {
        contextual.push(`${leadCharacter} 관계 더 만들기`);
      }

      return contextual;
    },
  },
  world: {
    summary: (draft) =>
      draft.worldEntries.length > 0
        ? `세계관은 ${draft.worldEntries.map((entry) => entry.title).join(', ')} 같은 요소가 잡혔어요.`
        : '세계관과 배경 규칙을 정리하고 있어요.',
    question: '이제 세계관의 규칙이나 주요 장소, 조직 같은 배경 설정을 정해볼까요?',
    followUp: (draft) => {
      const leadWorld = draft.worldEntries[0]?.title ?? draft.pendingWorldEntries?.[0]?.title;
      return leadWorld
        ? `${leadWorld} 같은 설정을 살리려면 세계 규칙을 더 조일지, 장소/조직을 넓힐지 먼저 정하는 게 좋아요. 어느 쪽이 좋나요?`
        : '세계관 단계에서는 규칙을 조일지, 장소와 조직을 넓힐지 먼저 정하면 전개가 빨라져요. 어느 쪽이 좋나요?';
    },
    options: ['주요 장소 만들기', '세계 규칙 정하기', '조직/세력 추가하기', '마법/능력 체계 정하기'],
    buildContextOptions: (draft) => {
      const contextual: string[] = [];
      if ((draft.pendingWorldEntries?.length ?? 0) > 0) {
        contextual.push('지금 후보부터 검토하기');
      }

      const leadWorld = draft.worldEntries[0]?.title ?? draft.pendingWorldEntries?.[0]?.title;
      if (leadWorld) {
        contextual.push(`${leadWorld} 디테일 보강하기`);
      }

      return contextual;
    },
  },
  plot: {
    summary: (draft) => {
      const parts = [
        quoteValue(draft.plotStructure),
        quoteValue(draft.pointOfView),
        quoteValue(draft.writingStyle),
      ].filter(Boolean);
      return parts.length > 0 ? `플롯/문체 방향은 ${parts.join(', ')}로 정리됐어요.` : '플롯과 문체 방향을 정리하고 있어요.';
    },
    question: '주요 사건 흐름과 갈등 전개를 큰 줄기로 정하고, 서술 시점·문체·첫 챕터 방향도 함께 잡아볼까요?',
    followUp: '플롯은 주인공이 가장 크게 흔들리는 전환점을 먼저 잡으면 덜 반복돼요. 문체는 시점과 템포 중 하나를 못 박으면 나머지가 따라옵니다. 어디부터 정할까요?',
    options: ['3막 구조로 정리하기', '중반 반전 넣기', '1인칭으로 쓰기', '3인칭 제한 시점', '첫 챕터 개요 써주기'],
    buildContextOptions: (draft) => {
      const contextual: string[] = [];
      if (draft.characters[0]?.name) {
        contextual.push(`${draft.characters[0].name} 목표선 정리하기`);
      }

      if (draft.worldEntries[0]?.title) {
        contextual.push(`${draft.worldEntries[0].title} 사건과 연결하기`);
      }

      if (draft.pointOfView) {
        contextual.push(`${draft.pointOfView} 시점으로 밀어붙이기`);
      }

      return contextual;
    },
  },

  complete: {
    summary: () => '전체 기획이 정리되고 있어요.',
    question: '전체 기획을 기준으로 빠진 부분을 함께 보완해볼까요?',
    followUp: '이제 전체 기획에서 가장 약한 부분 하나만 골라 보강해볼까요?',
    options: ['전체 기획 점검하기', '빠진 설정 보완하기', '첫 챕터 초안 시작하기', '프로젝트로 만들기'],
    buildContextOptions: (draft) => {
      const contextual: string[] = [];
      if (!draft.title?.trim()) {
        contextual.push('제목 정리하기');
      }

      if (!draft.firstChapterOutline?.trim()) {
        contextual.push('첫 챕터 개요 보강하기');
      }

      return contextual;
    },
  },
};

function quoteValue(value: string | undefined) {
  return value?.trim() ? `"${value.trim()}"` : undefined;
}

function resolvePhase(phase: StoryPlanningDraft['currentPhase']): StoryPlanningPhase {
  return phase ?? 'genre_tone';
}

function resolvePhaseText(
  text: string | ((draft: StoryPlanningDraft) => string),
  draft: StoryPlanningDraft
) {
  return typeof text === 'function' ? text(draft) : text;
}

function uniqueOptions(options: string[]) {
  return Array.from(
    new Set(options.map((option) => option.trim()).filter((option) => option.length > 0))
  ).slice(0, 6);
}

export function buildStoryPlanningPhaseSummary(
  phase: StoryPlanningDraft['currentPhase'],
  draft: StoryPlanningDraft
) {
  return STORY_PLANNING_PHASE_CONFIG[resolvePhase(phase)].summary(draft);
}

export function buildStoryPlanningPhaseQuestion(phase: StoryPlanningDraft['currentPhase']) {
  return STORY_PLANNING_PHASE_CONFIG[resolvePhase(phase)].question;
}

export function buildStoryPlanningPhaseFollowUp(
  phase: StoryPlanningDraft['currentPhase'],
  draft: StoryPlanningDraft
) {
  return resolvePhaseText(STORY_PLANNING_PHASE_CONFIG[resolvePhase(phase)].followUp, draft);
}

export function buildStoryPlanningOptions(draft: StoryPlanningDraft): string[] {
  const config = STORY_PLANNING_PHASE_CONFIG[resolvePhase(draft.currentPhase)];
  const contextual = config.buildContextOptions?.(draft) ?? [];
  return uniqueOptions([...contextual, ...config.options]);
}
