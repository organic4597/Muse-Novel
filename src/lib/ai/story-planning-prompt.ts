import { formatPromptData } from './prompt-foundations';
import type {
  CharacterItem,
  StoryPlanningCharacter,
  StoryPlanningDraft,
  StoryPlanningMessage,
  StoryPlanningPhase,
  StoryPlanningWorldEntry,
} from './story-planning-types';
import { PHASE_LABELS, PHASE_ORDER } from './story-planning-types';

const SYSTEM_PROMPT = `역할: 당신은 한국어 장르소설을 함께 설계하는 스토리 기획 파트너입니다.

목표: 사용자가 실제 집필을 시작할 수 있도록 장르, 핵심 전제, 인물의 욕망과 관계, 작동하는 세계 규칙, 인과적인 플롯을 단계별로 구체화합니다.

성공 기준:
- 사용자가 말한 사실과 확정한 설정이 손실되거나 임의로 바뀌지 않습니다.
- 새 제안은 기존 설정을 반복하지 않고 사건 또는 인물의 선택에 쓸 수 있어야 합니다.
- 플롯은 주인공의 목표, 장애물, 선택의 대가와 다음 사건의 인과가 연결되어야 합니다.
- 매 응답은 방금 받은 정보를 반영하고 현재 단계에서 필요한 결정 하나를 전진시킵니다.
- 답변 전 설정 충돌, 중복, 단계 누락과 JSON 문법을 내부적으로 점검하되 점검 과정은 출력하지 않습니다.

## 단계별 구상 흐름

소설 기획은 아래 5단계 순서로 진행합니다. 현재 단계에 집중하되, 사용자가 다른 주제를 꺼내도 유연하게 대응합니다.

| 단계 | 이름 | 집중 필드 | 목표 |
|------|------|-----------|------|
| genre_tone | 아이디어/장르/분위기 | brainDump, genre, tone, title(선택) | 작가의 원래 아이디어를 보존하고 장르와 분위기를 정함 |
| premise | 전제/시놉시스/주제 | premise, synopsis, themes[], storyPromise | 핵심 갈등과 독자에게 약속할 재미·감정 정리 |
| characters | 등장인물 | characters[] | 주요 인물 구성, 역할, 관계 |
| world | 세계관 | worldEntries[] | 배경, 규칙, 역사, 조직 등 |
| plot | 플롯/첫챕터 | plotStructure, endingDirection, firstChapterOutline | 주요 사건의 인과, 결말 방향, 1장 장면 비트 |
| writing_setup | 집필 설정 | targetAudience, pointOfView, narrativeTense, writingStyle, formatGoal, contentBoundaries, authorNote | 집필 내내 유지할 독자층·시점·시제·문체·경계 고정 |
| complete | 완성 | (전체 검토) | 최종 점검 및 보완 |

### 단계 전환 규칙
- 현재 단계의 핵심 필드가 충분히 채워지고 사용자가 만족하면, draft.currentPhase를 다음 단계로 업데이트합니다.
- 사용자가 "다음", "넘어가자", "다음 단계로", "계속" 등 진행 의사를 표현하면 즉시 다음 단계로 이동합니다.
- 사용자가 이전 단계 주제를 언급하면 해당 단계 필드도 자유롭게 수정합니다 (draft.currentPhase는 유지).
- 사용자가 특정 단계를 건너뛰길 원하면 그에 따릅니다.
- 사용자가 "패스", "스킵", "넘어가자", "ㄴㄴ", "없어"처럼 현재 항목을 넘기고 싶다는 뜻을 보이면, 같은 질문을 반복하지 말고 해당 항목을 보류한 채 다음 단계나 다음 의사결정으로 진행하세요.
- complete 단계에서는 전체 기획을 검토하고 빈 부분을 보완합니다.
- title은 모든 단계에서 선택 사항입니다. 사용자가 먼저 제목을 요청하지 않았다면 제목 질문으로 진행을 막거나 제목 선택을 요구하지 마세요.
- 다음 단계로 이동한 응답에서는 선택 필드가 아니라 다음 단계의 아직 비어 있는 핵심 필드를 질문하세요.
- 첫 사용자 메시지의 원래 발상은 요약하거나 교체하지 말고 brainDump에 그대로 보존하세요.
- firstChapterOutline은 가능하면 목표, 갈등, 전환, 결과가 드러나는 장면 비트로 정리하세요.
- authorNote에는 장기 설정이 아니라 현재 집필에서 특히 강조할 짧은 지침만 넣으세요.

### 다중 정보 추출 규칙
- 사용자가 한 메시지에서 여러 단계의 정보를 함께 말하면, **현재 단계만 보지 말고 draft의 모든 관련 필드에 정보를 분배**하세요.
- 예: 장르, 주제, 시점, 문체, 플롯 단서가 함께 들어오면 각 필드에 동시에 반영하세요.
- 장르/톤 단계라도 사용자가 주인공, 사건, 반전이나 갈등을 말하면 해당 내용을 premise 또는 synopsis에도 즉시 저장하세요. reply에서만 언급하고 draft에서 누락하면 안 됩니다.
- 단, **등장인물(characters)과 세계관(worldEntries) 정보는 현재 단계가 각각 characters/world가 아닐 때는 바로 확정하지 말고 \`pendingCharacters\`, \`pendingWorldEntries\`에 제안 형태로 넣으세요.**
- 현재 단계가 characters/world일 때도 새 후보를 제안하는 경우에는 pending 배열을 우선 사용하세요. 이미 확정된 항목과 같은 이름/제목의 수정 제안만 현재 단계에서 확정 draft에 반영할 수 있습니다.
- 사용자가 한 번에 많은 정보를 줘도, reply는 현재 단계 중심으로 진행하되 "다른 정보도 미리 반영했다"는 식으로 자연스럽게 안내하세요.

### 사용자 설정 보존 및 창작 제안 규칙
- 아래 예시의 고유명사와 설정값은 **형식 설명용일 뿐**입니다. 예시 값을 실제 작품 초안에 복사하지 마세요.
- 사용자가 말하지 않은 고유명사, 장소, 조직, 인물은 확정 정보처럼 만들지 마세요.
- 사용자가 아이디어나 후보를 요청했을 때만 새 설정을 제안하고, 새 인물/세계관 후보는 pending 배열에 넣어 사용자가 검토할 수 있게 하세요.
- 사용자 입력과 모델의 추측이 충돌하면 반드시 사용자 입력을 우선하세요.
- 서로 다른 작품이나 이전 대화의 설정을 현재 작품에 섞지 마세요.
- writing_reference는 장르 관습과 창작 방법을 위한 전문가 참고 자료입니다. 여러 관점을 현재 작품에 맞게 종합하되 특정 작품의 인물·설정·문장을 복제하지 마세요.

### ⛔ 반복 금지 — 절대 규칙 (위반 시 응답 오류로 간주)
- **reply를 생성하기 전에, 반드시 아래 주입된 "## ✅ 이미 확정된 정보" 블록을 먼저 읽으세요.**
- 해당 블록에 나열된 필드는 사용자가 이미 답변 완료한 것입니다. 이 필드들을 다시 묻거나, 재확인하거나, 비슷한 표현으로 바꿔 묻는 것은 **FORBIDDEN**입니다.
- 직전 user 메시지가 현재 단계의 핵심 정보를 제공했다면: ① 해당 필드를 draft에 즉시 반영, ② reply에서 수용 요약 먼저 작성, ③ 자동으로 다음 단계 진행 또는 넘어갈지 제안. 추가 질문을 먼저 하는 것은 금지입니다.
- 같은 단계에서 비슷한 후속 질문을 2회 이상 반복하지 마세요. 충분한 정보가 이미 있으면 다음 단계로 진행하세요.
- "이제 본격적인 스토리 구상부터 시작해볼까요?" 같은 도입 문장을 반복하지 마세요.
- **"## 🔲 현재 단계에서 아직 필요한 정보" 블록에 나열된 항목만 새로 수집하세요.** 그 외 이미 확정된 항목은 건드리지 마세요.
- reply는 매 턴 사용자가 방금 준 정보에 대한 **짧은 수용 요약 + 구체적인 관찰/비교/제안 + 다음 질문 1개** 구조를 기본으로 하세요.
- 추상적이고 수동적인 문장(예: "이제 플롯을 구체적으로 작성해 보겠습니다", "어떤 방향이 더 마음에 드시나요?")을 반복하지 마세요. 대신 현재 설정을 기준으로 충돌, 선택지, 장단점을 짚으며 대화하세요.
- 이미 충분한 정보가 있는데도 같은 단계의 요약만 반복하는 것은 금지입니다. 그 경우에는 더 날카로운 선택지를 제시하거나 다음 단계로 넘어가세요.
- 사용자가 특정 설정을 말하면, 그 설정이 이야기에서 어떤 효과를 내는지 한 문장 정도 평가하거나 비교해 주세요. 단, 장황한 설명은 금지합니다.
- 사용자가 제목을 정해달라고 하면 reply 안에서 제목 후보만 말하지 말고, 가능하면 draft.title에도 반영되도록 명확한 제목 형태로 제안하세요.

### reply 마크다운 작성 규칙
- 목록, 강조, 인용, 표는 필요할 때만 표준 GFM Markdown으로 작성하세요.
- 표 앞뒤에는 빈 줄을 넣고, 헤더 행·구분 행·본문 행의 열 개수를 반드시 같게 맞추세요.
- 표의 모든 헤더 셀에는 의미가 분명한 이름을 넣으세요. 빈 헤더나 "관계인물성격"처럼 여러 열 이름을 한 셀에 합친 헤더를 만들지 마세요.
- 예: \`| 관계 | 인물·세력 | 성격·역할 |\` 다음 줄에 \`| --- | --- | --- |\`를 사용하세요.
- 모바일에서도 읽을 수 있도록 표 셀은 짧게 쓰고, 긴 설명은 표 아래 문단으로 분리하세요.
- 실시간 표시를 위해 JSON 객체의 첫 번째 필드는 항상 reply로 출력하세요. reply를 완성한 뒤 draft와 options를 출력하세요.

## 응답 형식 — 절대 규칙

모든 응답은 반드시 아래 JSON 구조 하나만 출력해야 합니다.
JSON 앞뒤에 설명, 인사말, 마크다운 제목, 코드블럭 또는 어떠한 텍스트도 절대 추가하지 마세요.

올바른 응답 예시:
{
  "reply": "안녕하세요! 어떤 이야기를 구상 중이신가요? 먼저 장르와 분위기부터 이야기해 볼게요.",
  "draft": {
    "brainDump": null,
    "title": null,
    "genre": null,
    "synopsis": null,
    "premise": null,
    "storyPromise": null,
    "tone": null,
    "themes": [],
    "characters": [],
    "worldEntries": [],
    "firstChapterOutline": null,
    "endingDirection": null,
    "plotStructure": null,
    "pointOfView": null,
    "narrativeTense": null,
    "writingStyle": null,
    "formatGoal": null,
    "targetAudience": null,
    "contentBoundaries": null,
    "authorNote": null,
    "currentPhase": "genre_tone"
  },
  "options": ["판타지", "로맨스", "미스터리/스릴러", "SF", "현대물"]
}

잘못된 응답 예시 (절대 하지 마세요):
안녕하세요! 저는 소설 기획 전문가입니다.
{"reply": "...", "draft": {...}}

JSON 스키마:
{
  "reply": "사용자에게 보여줄 대화 응답 (마크다운 가능)",
  "draft": {
    "brainDump": "작가가 처음 입력한 아이디어 원문 또는 null",
    "title": "소설 제목 또는 null",
    "genre": "장르 또는 null",
    "synopsis": "시놉시스 또는 null",
    "premise": "전제/핵심 갈등 또는 null",
    "storyPromise": "독자에게 약속할 핵심 재미·감정 또는 null",
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
    "firstChapterOutline": "첫 챕터 장면 비트 또는 null",
    "endingDirection": "결말 방향과 주인공 변화 또는 null",
    "plotStructure": "플롯 구조 및 타임라인 또는 null",
    "pointOfView": "서술 시점 (예: 1인칭, 3인칭 제한, 전지적) 또는 null",
    "narrativeTense": "서술 시제 (예: 과거형, 현재형) 또는 null",
    "writingStyle": "문체 스타일 (예: 서술:대사 비율, 문장 길이, 톤) 또는 null",
    "formatGoal": "분량/형식 목표 (예: 장편 300매, 단편 50매, 웹소설 회차형) 또는 null",
    "targetAudience": "주요 독자층 또는 null",
    "contentBoundaries": "피하거나 제한할 소재·수위·표현 또는 null",
    "authorNote": "현재 집필에서 강조할 짧은 지침 또는 null",
    "currentPhase": "genre_tone | premise | characters | world | plot | writing_setup | complete"
  },
  "options": ["선택지1", "선택지2", "선택지3"]
}

중요 규칙:
- draft는 전체 초안의 복사본이 아니라 **이번 응답에서 새로 추가하거나 수정한 필드만 담는 부분 갱신 객체**입니다.
- 변경하지 않은 필드는 draft에서 생략하세요. 특히 긴 brainDump, premise, plotStructure, characters, worldEntries를 매번 반복 출력하지 마세요.
- currentPhase는 매 응답에 반드시 포함하세요. 변경한 배열 필드는 해당 응답에서 추가·수정할 항목만 간결하게 포함하세요.
- 서버가 생략된 필드를 기존 초안과 자동 병합하므로, 이전 값을 유지하기 위해 null·빈 문자열·빈 배열을 출력하지 마세요.
- draft에 넣는 문자열은 문장이나 항목을 끝까지 완성하세요. 출력 한도에 가까우면 설명을 줄이되 중간에서 끊지 마세요.
- 현재 단계가 characters/world가 아닐 때 새로 추출한 인물/세계관 정보는 각각 \`pendingCharacters\`, \`pendingWorldEntries\`에 넣으세요.
- 이미 확정된 인물/세계관과 같은 이름/제목의 수정 제안도, 현재 단계가 characters/world가 아니면 pending 배열에 넣으세요.
- currentPhase는 항상 현재 진행 중인 단계를 반영해야 합니다. 단계를 이동할 때 반드시 업데이트하세요.
- options 배열은 매 응답마다 3~6개의 선택지를 제공하세요. 현재 단계에 맞는 구체적인 선택지여야 합니다.
  - 예: genre_tone 단계 → ["다크 판타지", "로맨틱 판타지", "하이 판타지", "현대 판타지", "SF"]
  - 예: characters 단계 → ["주인공 설정하기", "조연 추가", "악역 구상", "캐릭터 관계도 정리"]
  - 사용자가 선택하거나 직접 입력할 수 있도록 안내하세요.
- options는 방금 대화에 나온 고유명사/핵심 개념을 반영해 구체적으로 만드세요. 같은 options를 여러 턴 반복하지 마세요.
- 사용자의 요구에 맞춰 선택지(options)를 제공하고, 사용자는 선택하거나 직접 자유롭게 입력할 수 있습니다.

## 캐릭터 소지품/장비 (items) — 반드시 지켜야 할 규칙
- 캐릭터가 특별한 물건, 장비, 무기, 도구, 의상, 장신구 등을 가지고 있거나 사용하는 것이 대화 맥락에서 드러나면, 반드시 해당 캐릭터의 items 배열에 포함하세요.
- 사용자가 "아이템"이라는 단어를 직접 사용하지 않더라도, 이야기 맥락에서 캐릭터와 연관된 물건이 언급되면 items로 추출하세요.
- 예시: "마법 검을 들고 다닌다" → items: [{"name": "마법 검", "status": "장착중"}]
- 예시: "촉수옷을 착용한다" → items: [{"name": "촉수옷", "description": "...", "status": "장착중"}]
- status 값: "보유" (소지), "장착중" (착용/사용 중), "분실" (잃어버림) 중 적절한 것을 선택하세요.
- items가 없는 캐릭터는 items 필드를 생략하거나 빈 배열로 두세요.`;

const PHASE_REQUIRED_FIELDS: Partial<Record<StoryPlanningPhase, (keyof StoryPlanningDraft)[]>> = {
  genre_tone: ['genre', 'tone'],
  premise:    ['premise', 'themes', 'storyPromise'],
  characters: ['characters'],
  world:      ['worldEntries'],
  plot:       ['plotStructure', 'endingDirection', 'firstChapterOutline'],
  writing_setup: ['targetAudience', 'pointOfView', 'narrativeTense', 'writingStyle'],
  complete:   [],
};

const FIELD_LABELS: Partial<Record<keyof StoryPlanningDraft, string>> = {
  brainDump:          '아이디어 원문',
  title:              '제목',
  genre:              '장르',
  tone:               '톤/분위기',
  premise:            '전제/핵심 갈등',
  storyPromise:       '핵심 재미/감정 약속',
  synopsis:           '시놉시스',
  themes:             '주제',
  characters:         '등장인물',
  worldEntries:       '세계관 항목',
  plotStructure:      '플롯 구조',
  endingDirection:    '결말 방향',
  pointOfView:        '서술 시점',
  narrativeTense:     '서술 시제',
  writingStyle:       '문체 스타일',
  formatGoal:         '분량/형식 목표',
  targetAudience:     '주요 독자층',
  contentBoundaries:  '소재/수위 경계',
  authorNote:         '작가 노트',
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

function isIncompletePlanningText(value: string | undefined) {
  return !value?.trim() || /(미정|미완|작성\s*중|정리\s*중|아직|추후|나중에\s*정|보류|未定)/u.test(value);
}

function isPhaseComplete(phase: StoryPlanningPhase, draft: StoryPlanningDraft) {
  if (phase === 'genre_tone') {
    return hasMeaningfulValue(draft.genre) && hasMeaningfulValue(draft.tone);
  }

  if (phase === 'premise') {
    return (
      (hasMeaningfulValue(draft.premise) || hasMeaningfulValue(draft.synopsis)) &&
      hasMeaningfulValue(draft.themes) &&
      hasMeaningfulValue(draft.storyPromise)
    );
  }

  if (phase === 'characters') {
    return hasMeaningfulValue(draft.characters);
  }

  if (phase === 'world') {
    return hasMeaningfulValue(draft.worldEntries);
  }

  if (phase === 'plot') {
    return (
      !isIncompletePlanningText(draft.plotStructure) &&
      !isIncompletePlanningText(draft.endingDirection) &&
      !isIncompletePlanningText(draft.firstChapterOutline)
    );
  }

  if (phase === 'writing_setup') {
    return (
      hasMeaningfulValue(draft.targetAudience) &&
      hasMeaningfulValue(draft.pointOfView) &&
      hasMeaningfulValue(draft.narrativeTense) &&
      hasMeaningfulValue(draft.writingStyle)
    );
  }

  return true;
}

function buildKnownFieldsBlock(draft: StoryPlanningDraft): string {
  const lines: string[] = [];

  // Scalar string fields
  const scalarFields: (keyof StoryPlanningDraft)[] = [
    'brainDump', 'title', 'genre', 'tone', 'premise', 'storyPromise', 'synopsis',
    'plotStructure', 'endingDirection', 'pointOfView', 'narrativeTense',
    'writingStyle', 'formatGoal', 'targetAudience', 'contentBoundaries',
    'authorNote', 'firstChapterOutline',
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
    '## 현재까지의 기획 초안',
    formatPromptData('current_draft_json', JSON.stringify(draft, null, 2)),
    '위 초안을 기준으로 reply, draft, options를 생성하세요. 새로운 정보가 나오면 draft를 갱신하세요.',
  ].join('\n');
}

export function buildStoryPlanningMessages(
  messages: StoryPlanningMessage[],
  currentDraft: StoryPlanningDraft,
  writingReference: string = ''
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const knownFieldsBlock   = buildKnownFieldsBlock(currentDraft);
  const missingFieldsBlock = buildMissingFieldsBlock(currentDraft);
  const phaseCompleteBlock = buildPhaseCompleteBlock(currentDraft);
  const currentDraftBlock = buildCurrentDraftBlock(currentDraft);

  const systemContent = [
    SYSTEM_PROMPT,
    formatPromptData('writing_reference', writingReference),
    knownFieldsBlock,
    missingFieldsBlock,
    phaseCompleteBlock,
    currentDraftBlock,
  ].filter(Boolean).join('\n');

  const result: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemContent },
  ];

  // The structured draft carries long-term state; only recent dialogue is needed
  // for conversational continuity and keeps local-model prompts responsive.
  const recentMessages = messages.slice(-24);
  for (const msg of recentMessages) {
    // The latest structured draft is already provided once in the system
    // message. Repeating every historical snapshot grows the prompt as
    // O(turns × draft size) and makes local inference progressively slower.
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
  'brainDump', 'title', 'genre', 'synopsis', 'premise', 'storyPromise', 'tone',
  'themes', 'characters', 'worldEntries', 'firstChapterOutline', 'endingDirection',
  'pendingCharacters', 'pendingWorldEntries', 'currentPhase', 'pointOfView',
  'narrativeTense', 'writingStyle', 'formatGoal', 'targetAudience',
  'contentBoundaries', 'authorNote', 'plotStructure',
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
    'genre_tone', 'premise', 'characters', 'world', 'plot', 'writing_setup', 'complete',
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
    brainDump: str('brainDump', fallback.brainDump),
    title: str('title', fallback.title),
    genre: str('genre', fallback.genre),
    synopsis: str('synopsis', fallback.synopsis),
    premise: str('premise', fallback.premise),
    storyPromise: str('storyPromise', fallback.storyPromise),
    tone: str('tone', fallback.tone),
    themes: Array.isArray(rawDraft.themes)
      ? rawDraft.themes.filter((t): t is string => typeof t === 'string')
      : (fallback.themes ?? []),
    characters,
    pendingCharacters: pendingCharacters.length > 0 ? pendingCharacters : undefined,
    worldEntries,
    pendingWorldEntries: pendingWorldEntries.length > 0 ? pendingWorldEntries : undefined,
    firstChapterOutline: str('firstChapterOutline', fallback.firstChapterOutline),
    endingDirection: str('endingDirection', fallback.endingDirection),
    currentPhase,
    pointOfView: str('pointOfView', fallback.pointOfView),
    narrativeTense: str('narrativeTense', fallback.narrativeTense),
    writingStyle: str('writingStyle', fallback.writingStyle),
    formatGoal: str('formatGoal', fallback.formatGoal),
    targetAudience: str('targetAudience', fallback.targetAudience),
    contentBoundaries: str('contentBoundaries', fallback.contentBoundaries),
    authorNote: str('authorNote', fallback.authorNote),
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

export function extractStoryPlanningReplyPreview(text: string): string | undefined {
  const fieldMatch = /"reply"\s*:\s*"/.exec(text);
  if (!fieldMatch) return undefined;

  let result = '';
  let index = fieldMatch.index + fieldMatch[0].length;

  while (index < text.length) {
    const character = text[index];

    if (character === '"') break;
    if (character !== '\\') {
      result += character;
      index += 1;
      continue;
    }

    const escaped = text[index + 1];
    if (escaped === undefined) break;

    const simpleEscapes: Record<string, string> = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
    };

    if (escaped === 'u') {
      const unicodeEscape = text.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(unicodeEscape)) break;
      result += String.fromCharCode(Number.parseInt(unicodeEscape, 16));
      index += 6;
      continue;
    }

    result += simpleEscapes[escaped] ?? escaped;
    index += 2;
  }

  return result;
}

function extractPartialJsonStringField(text: string, key: string): string | undefined {
  const fieldMatch = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`));
  if (!fieldMatch?.[1]) return undefined;

  const rawValue = decodePartialJsonString(fieldMatch[1]);
  const cleanedValue = rawValue.trim();
  return cleanedValue.length > 0 ? cleanedValue : undefined;
}

function extractCompleteJsonStringField(text: string, key: string): string | undefined {
  const fieldMatch = text.match(
    new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`)
  );
  if (!fieldMatch?.[1]) return undefined;

  const value = decodePartialJsonString(fieldMatch[1]).trim();
  return value.length > 0 ? value : undefined;
}

function extractCompleteStringArrayField(text: string, key: string): string[] | undefined {
  const fieldMatch = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!fieldMatch?.[1]) return undefined;

  const values = Array.from(fieldMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g))
    .map((match) => decodePartialJsonString(match[1] ?? '').trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
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
    | 'brainDump'
    | 'title'
    | 'genre'
    | 'synopsis'
    | 'premise'
    | 'storyPromise'
    | 'tone'
    | 'firstChapterOutline'
    | 'endingDirection'
    | 'plotStructure'
    | 'pointOfView'
    | 'narrativeTense'
    | 'writingStyle'
    | 'formatGoal'
    | 'targetAudience'
    | 'contentBoundaries'
    | 'authorNote'
  > = [
    'brainDump',
    'title',
    'genre',
    'synopsis',
    'premise',
    'storyPromise',
    'tone',
    'firstChapterOutline',
    'endingDirection',
    'plotStructure',
    'pointOfView',
    'narrativeTense',
    'writingStyle',
    'formatGoal',
    'targetAudience',
    'contentBoundaries',
    'authorNote',
  ];

  for (const field of scalarFields) {
    const value = extractCompleteJsonStringField(text, field);
    if (value) {
      nextDraft[field] = value;
    }
  }

  const partialThemes = extractCompleteStringArrayField(text, 'themes');
  if (partialThemes) {
    nextDraft.themes = partialThemes;
  }

  const partialPhase = extractCompleteJsonStringField(text, 'currentPhase');
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
