import type { CharacterItem, StoryPlanningDraft, StoryPlanningMessage, StoryPlanningPhase } from './story-planning-types';

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
    "worldEntries": [
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

export function buildStoryPlanningMessages(
  messages: StoryPlanningMessage[],
  currentDraft: StoryPlanningDraft
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const draftContext = JSON.stringify(currentDraft, null, 2);

  const systemWithDraft = `${SYSTEM_PROMPT}

현재까지의 기획 초안:
\`\`\`json
${draftContext}
\`\`\`
이 초안을 기반으로 대화를 이어가세요. 새로운 정보가 나오면 draft를 업데이트하세요.`;

  const result: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemWithDraft },
  ];

  for (const msg of messages) {
    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

export interface StoryPlanningResponse {
  reply: string;
  draft: StoryPlanningDraft;
  options?: string[];
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

function parseWorldEntry(w: unknown) {
  const we = w as Record<string, unknown>;
  return {
    category: typeof we.category === 'string' ? we.category : '기타',
    title: typeof we.title === 'string' ? we.title : '제목 없음',
    content: typeof we.content === 'string' ? we.content : undefined,
  };
}

function parseDraftFields(rawDraft: Record<string, unknown>, fallback: StoryPlanningDraft): StoryPlanningDraft {
  const existingCharacterNames = new Set(fallback.characters.map((c) => c.name));
  const existingWorldTitles = new Set(fallback.worldEntries.map((w) => w.title));

  let characters = fallback.characters;
  let pendingCharacters = fallback.pendingCharacters ?? [];

  if (Array.isArray(rawDraft.characters)) {
    const updatedExisting: typeof characters = [];
    const newPending: typeof pendingCharacters = [];

    for (const c of rawDraft.characters) {
      const parsed = parseCharacter(c);
      if (existingCharacterNames.has(parsed.name)) {
        updatedExisting.push(parsed);
      } else {
        newPending.push(parsed);
      }
    }

    characters = fallback.characters.map((existing) => {
      const updated = updatedExisting.find((u) => u.name === existing.name);
      return updated ?? existing;
    });

    const alreadyPendingNames = new Set(pendingCharacters.map((p) => p.name));
    pendingCharacters = [
      ...pendingCharacters,
      ...newPending.filter((p) => !alreadyPendingNames.has(p.name)),
    ];
  }

  let worldEntries = fallback.worldEntries;
  let pendingWorldEntries = fallback.pendingWorldEntries ?? [];

  if (Array.isArray(rawDraft.worldEntries)) {
    const updatedExisting: typeof worldEntries = [];
    const newPending: typeof pendingWorldEntries = [];

    for (const w of rawDraft.worldEntries) {
      const parsed = parseWorldEntry(w);
      if (existingWorldTitles.has(parsed.title)) {
        updatedExisting.push(parsed);
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

  const str = (key: string, fb: string | undefined): string | undefined => {
    if (!(key in rawDraft)) return fb;
    const v = rawDraft[key];
    return typeof v === 'string' ? v : undefined;
  };

  const VALID_PHASES = new Set<string>([
    'genre_tone', 'premise', 'themes', 'characters', 'world',
    'plot', 'writing_style', 'first_chapter', 'complete',
  ]);

  const currentPhase: StoryPlanningPhase = (
    typeof rawDraft.currentPhase === 'string' && VALID_PHASES.has(rawDraft.currentPhase)
  )
    ? rawDraft.currentPhase as StoryPlanningPhase
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

export function parseStoryPlanningResponse(
  text: string,
  fallbackDraft: StoryPlanningDraft
): StoryPlanningResponse {
  const textWithoutThinkBlocks = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // ── 1. ```json ... ``` 코드블럭 우선 탐색 ──────────────────────────────
  const codeBlockMatch = textWithoutThinkBlocks.match(/```json\s*([\s\S]*?)```/);
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
          return { reply, draft: parseDraftFields(rawDraft, fallbackDraft), options: extractOptions(obj) };
        }

        // 1-b. draft 키들만 있는 형식
        if (isDraftLike(obj)) {
          return { reply: textWithoutThinkBlocks, draft: parseDraftFields(obj, fallbackDraft), options: extractOptions(obj) };
        }
      }
    } catch { /* fallthrough */ }
  }

  // ── 2. 텍스트 내 모든 JSON 객체 탐색 ──────────────────────────────────
  const candidates = extractJsonObjects(textWithoutThinkBlocks);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed !== 'object' || parsed === null) continue;
      const obj = parsed as Record<string, unknown>;

      // 2-a. 표준 {"reply", "draft"} 형식
      if ('reply' in obj) {
        const reply = typeof obj.reply === 'string' ? obj.reply : stripAllJsonBlocks(textWithoutThinkBlocks, candidates);
        const rawDraft = (typeof obj.draft === 'object' && obj.draft !== null)
          ? obj.draft as Record<string, unknown>
          : obj;
        return { reply, draft: parseDraftFields(rawDraft, fallbackDraft), options: extractOptions(obj) };
      }

      // 2-b. draft 키들만 있는 형식 (AI가 draft 객체만 그대로 출력한 경우)
      if (isDraftLike(obj)) {
        const replyText = stripAllJsonBlocks(textWithoutThinkBlocks, candidates);
        return {
          reply: replyText || textWithoutThinkBlocks,
          draft: parseDraftFields(obj, fallbackDraft),
          options: extractOptions(obj),
        };
      }
    } catch { /* next candidate */ }
  }

  // ── 3. 파싱 실패 — 텍스트만 반환, draft는 유지 ───────────────────────
  return { reply: textWithoutThinkBlocks, draft: fallbackDraft };
}
