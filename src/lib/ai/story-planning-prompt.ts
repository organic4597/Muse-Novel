import type {
  CharacterItem,
  StoryPlanningCharacter,
  StoryPlanningDraft,
  StoryPlanningMessage,
  StoryPlanningPhase,
  StoryPlanningWorldEntry,
} from './story-planning-types';
import { PHASE_LABELS, PHASE_ORDER } from './story-planning-types';

const SYSTEM_PROMPT = `당신은 소설 기획 전문가입니다. 사용자와 대화하며 소설의 설정을 단계별로 함께 구상합니다.

## 단계별 구상 흐름

소설 기획은 아래 9단계 순서로 진행합니다. 현재 단계에 집중하되, 사용자가 다른 주제를 꺼내도 유연하게 대응합니다.

| 단계 | 이름 | 집중 필드 | 목표 |
|------|------|-----------|------|
| genre_tone | 장르/분위기 | genre, tone, title(선택) | 이야기의 장르와 전체적인 분위기/톤을 정함 |
| premise | 전제/시놉시스 | premise, synopsis | 핵심 갈등·설정, 한 줄 요약 |
| themes | 주제 | themes[] | 작품이 탐구할 주제 1~3개 |
| characters | 등장인물 | characters[] | 주요 인물 구성, 역할, 관계 |
| world | 세계관 | worldEntries[] | 배경, 규칙, 역사, 조직 등 |
| plot | 플롯/타임라인 | plotStructure | 주요 사건 흐름, 기승전결, 시간축 |
| writing_style | 시점/문체/분량 | pointOfView, writingStyle, formatGoal | 서술 시점, 문체 스타일, 목표 분량/형식 |
| first_chapter | 첫 챕터 | firstChapterOutline | 1장의 장면·사건 개요 |
| complete | 완성 | (전체 검토) | 최종 점검 및 보완 |

### 단계 전환 규칙
- 현재 단계의 핵심 필드가 충분히 채워지고 사용자가 만족하면, draft.currentPhase를 다음 단계로 업데이트합니다.
- 사용자가 "다음", "넘어가자", "다음 단계로", "계속" 등 진행 의사를 표현하면 즉시 다음 단계로 이동합니다.
- 사용자가 이전 단계 주제를 언급하면 해당 단계 필드도 자유롭게 수정합니다 (draft.currentPhase는 유지).
- 사용자가 특정 단계를 건너뛰길 원하면 그에 따릅니다.
- complete 단계에서는 전체 기획을 검토하고 빈 부분을 보완합니다.

### 다중 정보 추출 규칙
- 사용자가 한 메시지에서 여러 단계의 정보를 함께 말하면, **현재 단계만 보지 말고 draft의 모든 관련 필드에 정보를 분배**하세요.
- 예: 장르, 주제, 시점, 문체, 플롯 단서가 함께 들어오면 각 필드에 동시에 반영하세요.
- 단, **등장인물(characters)과 세계관(worldEntries) 정보는 현재 단계가 각각 characters/world가 아닐 때는 바로 확정하지 말고 \`pendingCharacters\`, \`pendingWorldEntries\`에 제안 형태로 넣으세요.**
- 현재 단계가 characters/world일 때도 새 후보를 제안하는 경우에는 pending 배열을 우선 사용하세요. 이미 확정된 항목과 같은 이름/제목의 수정 제안만 현재 단계에서 확정 draft에 반영할 수 있습니다.
- 사용자가 한 번에 많은 정보를 줘도, reply는 현재 단계 중심으로 진행하되 "다른 정보도 미리 반영했다"는 식으로 자연스럽게 안내하세요.

### ⛔ 반복 금지 — 절대 규칙 (위반 시 응답 오류로 간주)
- **reply를 생성하기 전에, 반드시 아래 주입된 "## ✅ 이미 확정된 정보" 블록을 먼저 읽으세요.**
- 해당 블록에 나열된 필드는 사용자가 이미 답변 완료한 것입니다. 이 필드들을 다시 묻거나, 재확인하거나, 비슷한 표현으로 바꿔 묻는 것은 **FORBIDDEN**입니다.
- 직전 user 메시지가 현재 단계의 핵심 정보를 제공했다면: ① 해당 필드를 draft에 즉시 반영, ② reply에서 수용 요약 먼저 작성, ③ 자동으로 다음 단계 진행 또는 넘어갈지 제안. 추가 질문을 먼저 하는 것은 금지입니다.
- 같은 단계에서 비슷한 후속 질문을 2회 이상 반복하지 마세요. 충분한 정보가 이미 있으면 다음 단계로 진행하세요.
- "이제 본격적인 스토리 구상부터 시작해볼까요?" 같은 도입 문장을 반복하지 마세요.
- **"## 🔲 현재 단계에서 아직 필요한 정보" 블록에 나열된 항목만 새로 수집하세요.** 그 외 이미 확정된 항목은 건드리지 마세요.

## 응답 형식 — 절대 규칙

모든 응답은 반드시 아래 JSON 구조 하나만 출력해야 합니다.
JSON 앞뒤에 설명, 인사말, 마크다운 제목, 또는 어떠한 텍스트도 절대 추가하지 마세요.
\`\`\`json 코드블럭으로 감싸도 되고, 감싸지 않고 raw JSON을 직접 출력해도 됩니다.

올바른 응답 예시:
\`\`\`json
{
  "reply": "안녕하세요! 어떤 이야기를 구상 중이신가요? 먼저 장르와 분위기부터 이야기해 볼게요.",
  "draft": {
    "title": null,
    "genre": null,
    "synopsis": null,
    "premise": null,
    "tone": null,
    "themes": [],
    "characters": [],
    "worldEntries": [],
    "firstChapterOutline": null,
    "plotStructure": null,
    "pointOfView": null,
    "writingStyle": null,
    "formatGoal": null,
    "currentPhase": "genre_tone"
  },
  "options": ["판타지", "로맨스", "미스터리/스릴러", "SF", "현대물"]
}
\`\`\`

잘못된 응답 예시 (절대 하지 마세요):
안녕하세요! 저는 소설 기획 전문가입니다.
{"reply": "...", "draft": {...}}

JSON 스키마:
{
  "reply": "사용자에게 보여줄 대화 응답 (마크다운 가능)",
  "draft": {
    "title": "소설 제목 또는 null",
    "genre": "장르 또는 null",
    "synopsis": "시놉시스 또는 null",
    "premise": "전제/핵심 갈등 또는 null",
    "tone": "톤/분위기 또는 null",
    "themes": ["주제1", "주제2"],
    "characters": [
      {
        "name": "이름",
        "role": "역할 (주인공/조연/악역 등)",
        "appearance": "외모 설명",
        "personality": "성격",
        "backstory": "배경 이야기",
        "arcDescription": "캐릭터 아크",
        "items": [
          { "name": "장비/소지품 이름", "description": "설명 (선택)", "status": "보유 | 장착중 | 분실" }
        ]
      }
    ],
    "pendingCharacters": [
      {
        "name": "이름",
        "role": "역할 (주인공/조연/악역 등)",
        "appearance": "외모 설명",
        "personality": "성격",
        "backstory": "배경 이야기",
        "arcDescription": "캐릭터 아크"
      }
    ],
    "worldEntries": [
      {
        "category": "장소/마법체계/기술/조직/역사 등",
        "title": "항목 이름",
        "content": "설명"
      }
    ],
    "pendingWorldEntries": [
      {
        "category": "장소/마법체계/기술/조직/역사 등",
        "title": "항목 이름",
        "content": "설명"
      }
    ],
    "firstChapterOutline": "첫 챕터 개요 또는 null",
    "plotStructure": "플롯 구조 및 타임라인 또는 null",
    "pointOfView": "서술 시점 (예: 1인칭, 3인칭 제한, 전지적) 또는 null",
    "writingStyle": "문체 스타일 (예: 서술:대사 비율, 문장 길이, 톤) 또는 null",
    "formatGoal": "분량/형식 목표 (예: 장편 300매, 단편 50매, 웹소설 회차형) 또는 null",
    "currentPhase": "genre_tone | premise | themes | characters | world | plot | writing_style | first_chapter | complete"
  },
  "options": ["선택지1", "선택지2", "선택지3"]
}

중요 규칙:
- draft 에는 지금까지 대화에서 합의된 내용만 포함하세요.
- 사용자가 명시적으로 언급하지 않은 필드는 이전 draft 값을 유지하거나 null/빈 배열로 두세요.
- characters와 worldEntries 배열은 대화가 진행됨에 따라 점진적으로 추가/수정합니다.
- 현재 단계가 characters/world가 아닐 때 새로 추출한 인물/세계관 정보는 각각 \`pendingCharacters\`, \`pendingWorldEntries\`에 넣으세요.
- 이미 확정된 인물/세계관과 같은 이름/제목의 수정 제안도, 현재 단계가 characters/world가 아니면 pending 배열에 넣으세요.
- currentPhase는 항상 현재 진행 중인 단계를 반영해야 합니다. 단계를 이동할 때 반드시 업데이트하세요.
- options 배열은 매 응답마다 3~6개의 선택지를 제공하세요. 현재 단계에 맞는 구체적인 선택지여야 합니다.
  - 예: genre_tone 단계 → ["다크 판타지", "로맨틱 판타지", "하이 판타지", "현대 판타지", "SF"]
  - 예: characters 단계 → ["주인공 설정하기", "조연 추가", "악역 구상", "캐릭터 관계도 정리"]
  - 사용자가 선택하거나 직접 입력할 수 있도록 안내하세요.
- 사용자의 요구에 맞춰 선택지(options)를 제공하고, 사용자는 선택하거나 직접 자유롭게 입력할 수 있습니다.

## 캐릭터 소지품/장비 (items) — 반드시 지켜야 할 규칙
- 캐릭터가 특별한 물건, 장비, 무기, 도구, 의상, 장신구 등을 가지고 있거나 사용하는 것이 대화 맥락에서 드러나면, 반드시 해당 캐릭터의 items 배열에 포함하세요.
- 사용자가 "아이템"이라는 단어를 직접 사용하지 않더라도, 이야기 맥락에서 캐릭터와 연관된 물건이 언급되면 items로 추출하세요.
- 예시: "마법 검을 들고 다닌다" → items: [{"name": "마법 검", "status": "장착중"}]
- 예시: "촉수옷을 착용한다" → items: [{"name": "촉수옷", "description": "...", "status": "장착중"}]
- status 값: "보유" (소지), "장착중" (착용/사용 중), "분실" (잃어버림) 중 적절한 것을 선택하세요.
- items가 없는 캐릭터는 items 필드를 생략하거나 빈 배열로 두세요.`;

const PHASE_REQUIRED_FIELDS: Partial<Record<StoryPlanningPhase, (keyof StoryPlanningDraft)[]>> = {
  genre_tone:    ['genre', 'tone'],
  premise:       ['premise', 'synopsis'],
  themes:        ['themes'],
  characters:    ['characters'],
  world:         ['worldEntries'],
  plot:          ['plotStructure'],
  writing_style: ['pointOfView', 'writingStyle', 'formatGoal'],
  first_chapter: ['firstChapterOutline'],
  complete:      [],
};

const FIELD_LABELS: Partial<Record<keyof StoryPlanningDraft, string>> = {
  title:              '제목',
  genre:              '장르',
  tone:               '톤/분위기',
  premise:            '전제/핵심 갈등',
  synopsis:           '시놉시스',
  themes:             '주제',
  characters:         '등장인물',
  worldEntries:       '세계관 항목',
  plotStructure:      '플롯 구조',
  pointOfView:        '서술 시점',
  writingStyle:       '문체 스타일',
  formatGoal:         '분량/형식 목표',
  firstChapterOutline:'첫 챕터 개요',
};

function getNextPhase(currentPhase: StoryPlanningPhase): StoryPlanningPhase {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
    return currentPhase;
  }

  return PHASE_ORDER[currentIndex + 1];
}

function hasMeaningfulValue(value: StoryPlanningDraft[keyof StoryPlanningDraft]) {
  return !(
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isPhaseComplete(phase: StoryPlanningPhase, draft: StoryPlanningDraft) {
  if (phase === 'genre_tone') {
    return hasMeaningfulValue(draft.genre) || hasMeaningfulValue(draft.tone);
  }

  if (phase === 'premise') {
    return hasMeaningfulValue(draft.premise) || hasMeaningfulValue(draft.synopsis);
  }

  if (phase === 'themes') {
    return hasMeaningfulValue(draft.themes);
  }

  if (phase === 'characters') {
    return hasMeaningfulValue(draft.characters);
  }

  if (phase === 'world') {
    return hasMeaningfulValue(draft.worldEntries);
  }

  if (phase === 'plot') {
    return hasMeaningfulValue(draft.plotStructure);
  }

  if (phase === 'writing_style') {
    return (
      hasMeaningfulValue(draft.pointOfView) ||
      hasMeaningfulValue(draft.writingStyle) ||
      hasMeaningfulValue(draft.formatGoal)
    );
  }

  if (phase === 'first_chapter') {
    return hasMeaningfulValue(draft.firstChapterOutline);
  }

  return true;
}

function buildKnownFieldsBlock(draft: StoryPlanningDraft): string {
  const lines: string[] = [];

  // Scalar string fields
  const scalarFields: (keyof StoryPlanningDraft)[] = [
    'title', 'genre', 'tone', 'premise', 'synopsis',
    'plotStructure', 'pointOfView', 'writingStyle', 'formatGoal', 'firstChapterOutline',
  ];
  for (const field of scalarFields) {
    const val = draft[field];
    if (typeof val === 'string' && val.trim().length > 0) {
      const label = FIELD_LABELS[field] ?? field;
      lines.push(`- **${label}**: "${val.trim()}" ← 확정 완료. 다시 묻지 마세요.`);
    }
  }

  // themes array
  if (Array.isArray(draft.themes) && draft.themes.length > 0) {
    lines.push(`- **주제**: [${draft.themes.map((t) => `"${t}"`).join(', ')}] ← 확정 완료. 다시 묻지 마세요.`);
  }

  // characters array
  if (draft.characters.length > 0) {
    const names = draft.characters.map((c) => c.name).join(', ');
    lines.push(`- **등장인물** (${draft.characters.length}명): ${names} ← 확정 완료. 새 인물 추가는 가능하나 기존 인물에 대한 기본 정보는 다시 묻지 마세요.`);
  }

  // worldEntries array
  if (draft.worldEntries.length > 0) {
    const titles = draft.worldEntries.map((w) => w.title).join(', ');
    lines.push(`- **세계관 항목** (${draft.worldEntries.length}개): ${titles} ← 확정 완료. 새 항목 추가는 가능하나 기존 항목은 다시 묻지 마세요.`);
  }

  if (draft.pendingCharacters && draft.pendingCharacters.length > 0) {
    const names = draft.pendingCharacters.map((c) => c.name).join(', ');
    lines.push(`- **검토 중인 등장인물 제안** (${draft.pendingCharacters.length}명): ${names} ← 이미 제안된 후보입니다. 다시 제안하지 마세요.`);
  }

  if (draft.pendingWorldEntries && draft.pendingWorldEntries.length > 0) {
    const titles = draft.pendingWorldEntries.map((w) => w.title).join(', ');
    lines.push(`- **검토 중인 세계관 제안** (${draft.pendingWorldEntries.length}개): ${titles} ← 이미 제안된 후보입니다. 다시 제안하지 마세요.`);
  }

  if (lines.length === 0) return '';

  return [
    '',
    '## ✅ 이미 확정된 정보 — 절대 다시 묻지 마세요',
    '아래 항목들은 사용자가 이미 답변 완료한 것입니다. reply에서 이 항목들을 질문하거나 재확인하는 것은 오류입니다.',
    '',
    ...lines,
  ].join('\n');
}

function buildMissingFieldsBlock(draft: StoryPlanningDraft): string {
  const phase = draft.currentPhase ?? 'genre_tone';
  if (phase === 'complete') return '';

  const requiredFields = PHASE_REQUIRED_FIELDS[phase] ?? [];
  const missing: string[] = [];

  for (const field of requiredFields) {
    const val = draft[field];
    const isEmpty =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim().length === 0) ||
      (Array.isArray(val) && val.length === 0);

    if (isEmpty) {
      const label = FIELD_LABELS[field] ?? String(field);
      missing.push(`- **${label}** (${String(field)})`);
    }
  }

  if (missing.length === 0) return '';

  return [
    '',
    `## 🔲 현재 단계(${PHASE_LABELS[phase]})에서 아직 필요한 정보`,
    '아래 항목만 새로 수집하세요. 이미 확정된 항목은 건드리지 마세요.',
    '',
    ...missing,
  ].join('\n');
}

function buildPhaseCompleteBlock(draft: StoryPlanningDraft): string {
  const phase = draft.currentPhase ?? 'genre_tone';
  if (phase === 'complete') return '';

  const requiredFields = PHASE_REQUIRED_FIELDS[phase] ?? [];
  if (requiredFields.length === 0) return '';

  if (!isPhaseComplete(phase, draft)) return '';

  const nextPhase = getNextPhase(phase);
  const nextPhaseLabel = PHASE_LABELS[nextPhase];

  return [
    '',
    `## ✅ 단계 완료 신호 — 현재 단계(${PHASE_LABELS[phase]}) 핵심 정보가 충분합니다`,
    '이 단계에서 수집해야 할 정보가 모두 확보되었습니다.',
    nextPhase === phase
      ? '현재는 마지막 단계입니다. 전체 기획을 요약하고 빠진 부분만 보완하세요.'
      : `**즉시 다음 단계로 이동하세요.** draft.currentPhase를 "${nextPhase}"로 업데이트하고, reply에서 완료 요약 후 **${nextPhaseLabel}** 단계의 첫 질문을 하세요. 현재 단계 내용을 다시 묻지 마세요.`,
  ].join('\n');
}

function buildCurrentDraftBlock(draft: StoryPlanningDraft): string {
  return [
    '',
    '## 현재까지의 기획 초안(JSON)',
    '```json',
    JSON.stringify(draft, null, 2),
    '```',
    '위 초안을 기준으로 reply, draft, options를 생성하세요. 새로운 정보가 나오면 draft를 갱신하세요.',
  ].join('\n');
}

export function buildStoryPlanningMessages(
  messages: StoryPlanningMessage[],
  currentDraft: StoryPlanningDraft
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const knownFieldsBlock   = buildKnownFieldsBlock(currentDraft);
  const missingFieldsBlock = buildMissingFieldsBlock(currentDraft);
  const phaseCompleteBlock = buildPhaseCompleteBlock(currentDraft);
  const currentDraftBlock = buildCurrentDraftBlock(currentDraft);

  const systemContent = [
    SYSTEM_PROMPT,
    knownFieldsBlock,
    missingFieldsBlock,
    phaseCompleteBlock,
    currentDraftBlock,
  ].filter(Boolean).join('\n');

  const result: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemContent },
  ];

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.draftSnapshot) {
      result.push({
        role: 'assistant',
        content: JSON.stringify(
          {
            reply: msg.content,
            draft: msg.draftSnapshot,
            options: msg.options,
          },
          null,
          2
        ),
      });
      continue;
    }

    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

export interface StoryPlanningResponse {
  reply: string;
  draft: StoryPlanningDraft;
  options?: string[];
  debug?: {
    mode: 'codeblock' | 'embedded' | 'fallback';
    candidateCount: number;
    rawTextPreview: string;
  };
}

function buildParseDebug(
  mode: 'codeblock' | 'embedded' | 'fallback',
  text: string,
  candidateCount: number
) {
  return {
    mode,
    candidateCount,
    rawTextPreview: text.replace(/\s+/g, ' ').trim().slice(0, 400),
  };
}

const DRAFT_KEYS = new Set([
  'title', 'genre', 'synopsis', 'premise', 'tone', 'themes', 'characters', 'worldEntries', 'firstChapterOutline',
  'currentPhase', 'pointOfView', 'writingStyle', 'formatGoal', 'plotStructure',
]);

function isDraftLike(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((k) => DRAFT_KEYS.has(k));
}

function parseItem(item: unknown): CharacterItem {
  const it = item as Record<string, unknown>;
  return {
    name: typeof it.name === 'string' ? it.name : '이름 없음',
    description: typeof it.description === 'string' ? it.description : undefined,
    status: typeof it.status === 'string' ? it.status : undefined,
  };
}

function parseCharacter(c: unknown) {
  const ch = c as Record<string, unknown>;
  return {
    name: typeof ch.name === 'string' ? ch.name : '이름 없음',
    role: typeof ch.role === 'string' ? ch.role : undefined,
    appearance: typeof ch.appearance === 'string' ? ch.appearance : undefined,
    personality: typeof ch.personality === 'string' ? ch.personality : undefined,
    backstory: typeof ch.backstory === 'string' ? ch.backstory : undefined,
    arcDescription: typeof ch.arcDescription === 'string' ? ch.arcDescription : undefined,
    items: Array.isArray(ch.items) ? ch.items.map(parseItem) : undefined,
  };
}

function normalizeCharacterIdentityPart(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function isPlaceholderCharacterName(name: string | undefined) {
  const normalized = normalizeCharacterIdentityPart(name);
  return normalized === '' || normalized === '이름 없음';
}

function getCharacterIdentityKey(character: Pick<StoryPlanningCharacter, 'name' | 'role'>) {
  const normalizedName = normalizeCharacterIdentityPart(character.name);
  const normalizedRole = normalizeCharacterIdentityPart(character.role);

  if (!isPlaceholderCharacterName(character.name)) {
    return `name:${normalizedName}`;
  }

  if (normalizedRole) {
    return `placeholder-role:${normalizedRole}`;
  }

  return `placeholder-name:${normalizedName}`;
}

function normalizeCharacterItems(items: CharacterItem[] | undefined) {
  return (items ?? []).map((item) => ({
    name: normalizeCharacterIdentityPart(item.name),
    description: normalizeCharacterIdentityPart(item.description),
    status: normalizeCharacterIdentityPart(item.status),
  }));
}

function areCharactersEquivalent(a: StoryPlanningCharacter, b: StoryPlanningCharacter) {
  return (
    normalizeCharacterIdentityPart(a.name) === normalizeCharacterIdentityPart(b.name) &&
    normalizeCharacterIdentityPart(a.role) === normalizeCharacterIdentityPart(b.role) &&
    normalizeCharacterIdentityPart(a.appearance) === normalizeCharacterIdentityPart(b.appearance) &&
    normalizeCharacterIdentityPart(a.personality) === normalizeCharacterIdentityPart(b.personality) &&
    normalizeCharacterIdentityPart(a.backstory) === normalizeCharacterIdentityPart(b.backstory) &&
    normalizeCharacterIdentityPart(a.arcDescription) === normalizeCharacterIdentityPart(b.arcDescription) &&
    JSON.stringify(normalizeCharacterItems(a.items)) === JSON.stringify(normalizeCharacterItems(b.items))
  );
}

function areWorldEntriesEquivalent(a: StoryPlanningWorldEntry, b: StoryPlanningWorldEntry) {
  return (
    normalizeCharacterIdentityPart(a.category) === normalizeCharacterIdentityPart(b.category) &&
    normalizeCharacterIdentityPart(a.title) === normalizeCharacterIdentityPart(b.title) &&
    normalizeCharacterIdentityPart(a.content) === normalizeCharacterIdentityPart(b.content)
  );
}

function parseWorldEntry(w: unknown) {
  const we = w as Record<string, unknown>;
  return {
    category: typeof we.category === 'string' ? we.category : '기타',
    title: typeof we.title === 'string' ? we.title : '제목 없음',
    content: typeof we.content === 'string' ? we.content : undefined,
  };
}

type ParseDraftFieldOptions = {
  stagedPhase?: StoryPlanningPhase;
};

function parseDraftFields(
  rawDraft: Record<string, unknown>,
  fallback: StoryPlanningDraft,
  options: ParseDraftFieldOptions = {}
): StoryPlanningDraft {
  const existingCharacterKeys = new Set(fallback.characters.map(getCharacterIdentityKey));
  const existingWorldTitles = new Set(fallback.worldEntries.map((w) => w.title));
  const stagedPhase = options.stagedPhase ?? fallback.currentPhase ?? 'genre_tone';
  const allowAcceptedCharacterUpdates = stagedPhase === 'characters';
  const allowAcceptedWorldUpdates = stagedPhase === 'world';

  let characters = fallback.characters;
  let pendingCharacters = fallback.pendingCharacters ?? [];

  if (Array.isArray(rawDraft.characters)) {
    const updatedExisting: typeof characters = [];
    const newPending: typeof pendingCharacters = [];

    for (const c of rawDraft.characters) {
      const parsed = parseCharacter(c);
      const characterKey = getCharacterIdentityKey(parsed);
      const existingAccepted = fallback.characters.find(
        (character) => getCharacterIdentityKey(character) === characterKey
      );
      if (existingCharacterKeys.has(characterKey) && allowAcceptedCharacterUpdates) {
        updatedExisting.push(parsed);
      } else if (existingAccepted && areCharactersEquivalent(existingAccepted, parsed)) {
      } else {
        newPending.push(parsed);
      }
    }

    characters = fallback.characters.map((existing) => {
      const existingKey = getCharacterIdentityKey(existing);
      const updated = updatedExisting.find((u) => getCharacterIdentityKey(u) === existingKey);
      return updated ?? existing;
    });

    const alreadyPendingKeys = new Set(pendingCharacters.map(getCharacterIdentityKey));
    pendingCharacters = [
      ...pendingCharacters,
      ...newPending.filter((p) => !alreadyPendingKeys.has(getCharacterIdentityKey(p))),
    ];
  }

  pendingCharacters = mergePendingCharacters(
    pendingCharacters,
    parsePendingCharacters(rawDraft).filter(
      (character) => {
        const identityKey = getCharacterIdentityKey(character);
        if (!existingCharacterKeys.has(identityKey)) {
          return true;
        }

        const existingAccepted = fallback.characters.find(
          (candidate) => getCharacterIdentityKey(candidate) === identityKey
        );

        return existingAccepted ? !areCharactersEquivalent(existingAccepted, character) : true;
      }
    )
  ) ?? [];

  let worldEntries = fallback.worldEntries;
  let pendingWorldEntries = fallback.pendingWorldEntries ?? [];

  if (Array.isArray(rawDraft.worldEntries)) {
    const updatedExisting: typeof worldEntries = [];
    const newPending: typeof pendingWorldEntries = [];

    for (const w of rawDraft.worldEntries) {
      const parsed = parseWorldEntry(w);
      const existingAccepted = fallback.worldEntries.find((entry) => entry.title === parsed.title);
      if (existingWorldTitles.has(parsed.title) && allowAcceptedWorldUpdates) {
        updatedExisting.push(parsed);
      } else if (existingAccepted && areWorldEntriesEquivalent(existingAccepted, parsed)) {
      } else {
        newPending.push(parsed);
      }
    }

    worldEntries = fallback.worldEntries.map((existing) => {
      const updated = updatedExisting.find((u) => u.title === existing.title);
      return updated ?? existing;
    });

    const alreadyPendingTitles = new Set(pendingWorldEntries.map((p) => p.title));
    pendingWorldEntries = [
      ...pendingWorldEntries,
      ...newPending.filter((p) => !alreadyPendingTitles.has(p.title)),
    ];
  }

  pendingWorldEntries = mergePendingWorldEntries(
    pendingWorldEntries,
    parsePendingWorldEntries(rawDraft).filter((entry) => {
      if (!existingWorldTitles.has(entry.title)) {
        return true;
      }

      const existingAccepted = fallback.worldEntries.find((candidate) => candidate.title === entry.title);
      return existingAccepted ? !areWorldEntriesEquivalent(existingAccepted, entry) : true;
    })
  ) ?? [];

  const str = (key: string, fb: string | undefined): string | undefined => {
    if (!(key in rawDraft)) return fb;
    const v = rawDraft[key];
    if (typeof v === 'string') {
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(v)) {
      const parts = v
        .filter((part): part is string => typeof part === 'string')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
    return fb;
  };

  const VALID_PHASES = new Set<string>([
    'genre_tone', 'premise', 'themes', 'characters', 'world',
    'plot', 'writing_style', 'first_chapter', 'complete',
  ]);

  const rawCurrentPhase = typeof rawDraft.currentPhase === 'string'
    ? rawDraft.currentPhase.trim()
    : undefined;

  const currentPhase: StoryPlanningPhase = (
    typeof rawCurrentPhase === 'string' && VALID_PHASES.has(rawCurrentPhase)
  )
    ? rawCurrentPhase as StoryPlanningPhase
    : fallback.currentPhase ?? 'genre_tone';

  return {
    title: str('title', fallback.title),
    genre: str('genre', fallback.genre),
    synopsis: str('synopsis', fallback.synopsis),
    premise: str('premise', fallback.premise),
    tone: str('tone', fallback.tone),
    themes: Array.isArray(rawDraft.themes)
      ? rawDraft.themes.filter((t): t is string => typeof t === 'string')
      : (fallback.themes ?? []),
    characters,
    pendingCharacters: pendingCharacters.length > 0 ? pendingCharacters : undefined,
    worldEntries,
    pendingWorldEntries: pendingWorldEntries.length > 0 ? pendingWorldEntries : undefined,
    firstChapterOutline: str('firstChapterOutline', fallback.firstChapterOutline),
    currentPhase,
    pointOfView: str('pointOfView', fallback.pointOfView),
    writingStyle: str('writingStyle', fallback.writingStyle),
    formatGoal: str('formatGoal', fallback.formatGoal),
    plotStructure: str('plotStructure', fallback.plotStructure),
  };
}

type ParseResponseOptions = {
  stagedPhase?: StoryPlanningPhase;
};

function parsePendingCharacters(rawDraft: Record<string, unknown>) {
  if (!Array.isArray(rawDraft.pendingCharacters)) {
    return [] as ReturnType<typeof parseCharacter>[];
  }

  return rawDraft.pendingCharacters.map(parseCharacter);
}

function parsePendingWorldEntries(rawDraft: Record<string, unknown>) {
  if (!Array.isArray(rawDraft.pendingWorldEntries)) {
    return [] as ReturnType<typeof parseWorldEntry>[];
  }

  return rawDraft.pendingWorldEntries.map(parseWorldEntry);
}

function mergePendingCharacters(
  existing: StoryPlanningDraft['pendingCharacters'],
  incoming: StoryPlanningCharacter[]
) {
  const next = [...(existing ?? [])];
  const byIdentity = new Map(next.map((character) => [getCharacterIdentityKey(character), character]));

  for (const character of incoming) {
    const identityKey = getCharacterIdentityKey(character);
    if (byIdentity.has(identityKey)) {
      byIdentity.set(identityKey, character);
      continue;
    }

    next.push(character);
    byIdentity.set(identityKey, character);
  }

  return next.length > 0 ? Array.from(byIdentity.values()) : undefined;
}

function mergePendingWorldEntries(
  existing: StoryPlanningDraft['pendingWorldEntries'],
  incoming: StoryPlanningWorldEntry[]
) {
  const next = [...(existing ?? [])];
  const byTitle = new Map(next.map((entry) => [entry.title, entry]));

  for (const entry of incoming) {
    if (byTitle.has(entry.title)) {
      byTitle.set(entry.title, entry);
      continue;
    }

    next.push(entry);
    byTitle.set(entry.title, entry);
  }

  return next.length > 0 ? Array.from(byTitle.values()) : undefined;
}

function enforceCrossPhasePending(
  draft: StoryPlanningDraft,
  fallback: StoryPlanningDraft,
  stagedPhase: StoryPlanningPhase
): StoryPlanningDraft {
  let nextDraft = draft;

  if (stagedPhase !== 'characters' && draft.characters.length > fallback.characters.length) {
    const existingNames = new Set(fallback.characters.map((character) => character.name));
    const promoted = draft.characters.filter((character) => !existingNames.has(character.name));

    nextDraft = {
      ...nextDraft,
      characters: fallback.characters,
      pendingCharacters: mergePendingCharacters(nextDraft.pendingCharacters, promoted),
    };
  }

  if (stagedPhase !== 'world' && draft.worldEntries.length > fallback.worldEntries.length) {
    const existingTitles = new Set(fallback.worldEntries.map((entry) => entry.title));
    const promoted = draft.worldEntries.filter((entry) => !existingTitles.has(entry.title));

    nextDraft = {
      ...nextDraft,
      worldEntries: fallback.worldEntries,
      pendingWorldEntries: mergePendingWorldEntries(nextDraft.pendingWorldEntries, promoted),
    };
  }

  return nextDraft;
}

/** JSON 문자열에서 가장 바깥쪽 { } 블럭을 모두 추출한다. */
function extractJsonObjects(text: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        results.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return results;
}

function stripAllJsonBlocks(text: string, jsonCandidates: string[]): string {
  let result = text;
  for (const candidate of jsonCandidates) {
    result = result.replace(candidate, '');
  }
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

function extractOptions(obj: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(obj.options)) return undefined;
  const filtered = obj.options.filter((o): o is string => typeof o === 'string');
  return filtered.length > 0 ? filtered : undefined;
}

function decodePartialJsonString(rawValue: string): string {
  return rawValue
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractPartialJsonStringField(text: string, key: string): string | undefined {
  const fieldMatch = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`));
  if (!fieldMatch?.[1]) return undefined;

  const rawValue = decodePartialJsonString(fieldMatch[1]);
  const cleanedValue = rawValue.trim();
  return cleanedValue.length > 0 ? cleanedValue : undefined;
}

function extractPartialStringArrayField(text: string, key: string): string[] | undefined {
  const fieldMatch = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)(?:\\]|$)`));
  if (!fieldMatch?.[1]) return undefined;

  const values = Array.from(fieldMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g))
    .map((match) => decodePartialJsonString(match[1] ?? '').trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function extractPartialReply(text: string): string | undefined {
  return extractPartialJsonStringField(text, 'reply');
}

function extractPartialDraft(text: string, fallbackDraft: StoryPlanningDraft): StoryPlanningDraft {
  const nextDraft: StoryPlanningDraft = { ...fallbackDraft };

  const scalarFields: Array<
    | 'title'
    | 'genre'
    | 'synopsis'
    | 'premise'
    | 'tone'
    | 'firstChapterOutline'
    | 'plotStructure'
    | 'pointOfView'
    | 'writingStyle'
    | 'formatGoal'
  > = [
    'title',
    'genre',
    'synopsis',
    'premise',
    'tone',
    'firstChapterOutline',
    'plotStructure',
    'pointOfView',
    'writingStyle',
    'formatGoal',
  ];

  for (const field of scalarFields) {
    const value = extractPartialJsonStringField(text, field);
    if (value) {
      nextDraft[field] = value;
    }
  }

  const partialThemes = extractPartialStringArrayField(text, 'themes');
  if (partialThemes) {
    nextDraft.themes = partialThemes;
  }

  const partialPhase = extractPartialJsonStringField(text, 'currentPhase');
  if (partialPhase) {
    const validPhases = new Set<StoryPlanningPhase>(PHASE_ORDER);
    const matchedPhase = Array.from(validPhases).find((phase) => phase === partialPhase || phase.startsWith(partialPhase));
    if (matchedPhase) {
      nextDraft.currentPhase = matchedPhase;
    }
  }

  return nextDraft;
}

function extractPartialOptions(text: string): string[] | undefined {
  return extractPartialStringArrayField(text, 'options');
}

export { isPhaseComplete, getNextPhase };

export function parseStoryPlanningResponse(
  text: string,
  fallbackDraft: StoryPlanningDraft,
  options: ParseResponseOptions = {}
): StoryPlanningResponse {
  const textWithoutThinkBlocks = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const codeBlockMatch = textWithoutThinkBlocks.match(/```json\s*([\s\S]*?)```/);
  const stagedPhase = options.stagedPhase ?? fallbackDraft.currentPhase ?? 'genre_tone';

  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1] ?? '');
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;

        // 1-a. {"reply": ..., "draft": ...} 표준 형식
        if ('reply' in obj) {
          const reply = typeof obj.reply === 'string' ? obj.reply : textWithoutThinkBlocks;
          const rawDraft = (typeof obj.draft === 'object' && obj.draft !== null)
            ? obj.draft as Record<string, unknown>
            : obj; // draft 키 없으면 obj 자체를 draft로
          const parsedDraft = parseDraftFields(rawDraft, fallbackDraft, { stagedPhase });
          const enforcedDraft = enforceCrossPhasePending(parsedDraft, fallbackDraft, stagedPhase);
          return {
            reply,
            draft: enforcedDraft,
            options: extractOptions(obj),
            debug: buildParseDebug('codeblock', textWithoutThinkBlocks, 1),
          };
        }

        if (isDraftLike(obj)) {
          const parsedDraft = parseDraftFields(obj, fallbackDraft, { stagedPhase });
          const enforcedDraft = enforceCrossPhasePending(parsedDraft, fallbackDraft, stagedPhase);
          return {
            reply: textWithoutThinkBlocks,
            draft: enforcedDraft,
            options: extractOptions(obj),
            debug: buildParseDebug('codeblock', textWithoutThinkBlocks, 1),
          };
        }
      }
    } catch { /* fallthrough */ }
  }

  const candidates = extractJsonObjects(textWithoutThinkBlocks);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed !== 'object' || parsed === null) continue;
      const obj = parsed as Record<string, unknown>;

      if ('reply' in obj) {
        const reply = typeof obj.reply === 'string' ? obj.reply : stripAllJsonBlocks(textWithoutThinkBlocks, candidates);
        const rawDraft = (typeof obj.draft === 'object' && obj.draft !== null)
          ? obj.draft as Record<string, unknown>
          : obj;
        const parsedDraft = parseDraftFields(rawDraft, fallbackDraft, { stagedPhase });
        const enforcedDraft = enforceCrossPhasePending(parsedDraft, fallbackDraft, stagedPhase);
        return {
          reply,
          draft: enforcedDraft,
          options: extractOptions(obj),
          debug: buildParseDebug('embedded', textWithoutThinkBlocks, candidates.length),
        };
      }

      if (isDraftLike(obj)) {
        const replyText = stripAllJsonBlocks(textWithoutThinkBlocks, candidates);
        const parsedDraft = parseDraftFields(obj, fallbackDraft, { stagedPhase });
        const enforcedDraft = enforceCrossPhasePending(parsedDraft, fallbackDraft, stagedPhase);
        return {
          reply: replyText || textWithoutThinkBlocks,
          draft: enforcedDraft,
          options: extractOptions(obj),
          debug: buildParseDebug('embedded', textWithoutThinkBlocks, candidates.length),
        };
      }
    } catch { /* next candidate */ }
  }

  const partialReply = extractPartialReply(textWithoutThinkBlocks);
  const partialDraft = enforceCrossPhasePending(
    extractPartialDraft(textWithoutThinkBlocks, fallbackDraft),
    fallbackDraft,
    stagedPhase
  );
  const partialOptions = extractPartialOptions(textWithoutThinkBlocks);
  if (partialReply) {
    return {
      reply: partialReply,
      draft: partialDraft,
      options: partialOptions,
      debug: buildParseDebug('fallback', textWithoutThinkBlocks, candidates.length),
    };
  }

  return {
    reply: textWithoutThinkBlocks,
    draft: partialDraft,
    options: partialOptions,
    debug: buildParseDebug('fallback', textWithoutThinkBlocks, candidates.length),
  };
}
