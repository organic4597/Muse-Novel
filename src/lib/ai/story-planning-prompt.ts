import type { StoryPlanningDraft, StoryPlanningMessage } from './story-planning-types';

const SYSTEM_PROMPT = `당신은 소설 기획 전문가입니다. 사용자와 대화하며 소설의 설정을 함께 구상합니다.

역할:
- 사용자가 원하는 이야기의 방향을 파악하고, 제목, 장르, 시놉시스, 전제, 톤, 주제, 등장인물, 세계관, 첫 챕터 개요를 함께 발전시킵니다.
- 대화를 통해 점진적으로 구체화해 나갑니다. 한 번에 모든 것을 요청하지 마세요.
- 사용자가 아직 정하지 않은 요소는 추측하지 말고, 질문이나 제안을 통해 이끌어내세요.
- 한국어로 대화합니다.

응답 형식:
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트를 JSON 바깥에 넣지 마세요.

\`\`\`json
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
    "firstChapterOutline": "첫 챕터 개요 또는 null"
  }
}
\`\`\`

중요 규칙:
- draft 에는 지금까지 대화에서 합의된 내용만 포함하세요.
- 사용자가 명시적으로 언급하지 않은 필드는 이전 draft 값을 유지하거나 null/빈 배열로 두세요.
- characters와 worldEntries 배열은 대화가 진행됨에 따라 점진적으로 추가/수정합니다.
- 첫 대화에서는 사용자의 아이디어를 들으며 장르와 분위기를 파악하는 것부터 시작하세요.`;

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
}

export function parseStoryPlanningResponse(
  text: string,
  fallbackDraft: StoryPlanningDraft
): StoryPlanningResponse {
  const textWithoutThinkBlocks = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  const jsonMatch = textWithoutThinkBlocks.match(/```json\s*([\s\S]*?)```/) || textWithoutThinkBlocks.match(/\{[\s\S]*"reply"[\s\S]*"draft"[\s\S]*\}/);

  let parsed: unknown;
  try {
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : textWithoutThinkBlocks;
    parsed = JSON.parse(jsonStr);
  } catch {
    return { reply: textWithoutThinkBlocks, draft: fallbackDraft };
  }

  if (typeof parsed === 'object' && parsed !== null && 'reply' in parsed) {
    const obj = parsed as Record<string, unknown>;
    const reply = typeof obj.reply === 'string' ? obj.reply : textWithoutThinkBlocks;
    const rawDraft = (typeof obj.draft === 'object' && obj.draft !== null) ? obj.draft as Record<string, unknown> : {};

    const draft: StoryPlanningDraft = {
      title: typeof rawDraft.title === 'string' ? rawDraft.title : fallbackDraft.title,
      genre: typeof rawDraft.genre === 'string' ? rawDraft.genre : fallbackDraft.genre,
      synopsis: typeof rawDraft.synopsis === 'string' ? rawDraft.synopsis : fallbackDraft.synopsis,
      premise: typeof rawDraft.premise === 'string' ? rawDraft.premise : fallbackDraft.premise,
      tone: typeof rawDraft.tone === 'string' ? rawDraft.tone : fallbackDraft.tone,
      themes: Array.isArray(rawDraft.themes) ? rawDraft.themes.filter((t): t is string => typeof t === 'string') : (fallbackDraft.themes ?? []),
      characters: Array.isArray(rawDraft.characters)
        ? rawDraft.characters.map((c: unknown) => {
            const ch = c as Record<string, unknown>;
            return {
              name: typeof ch.name === 'string' ? ch.name : '이름 없음',
              role: typeof ch.role === 'string' ? ch.role : undefined,
              appearance: typeof ch.appearance === 'string' ? ch.appearance : undefined,
              personality: typeof ch.personality === 'string' ? ch.personality : undefined,
              backstory: typeof ch.backstory === 'string' ? ch.backstory : undefined,
              arcDescription: typeof ch.arcDescription === 'string' ? ch.arcDescription : undefined,
            };
          })
        : fallbackDraft.characters,
      worldEntries: Array.isArray(rawDraft.worldEntries)
        ? rawDraft.worldEntries.map((w: unknown) => {
            const we = w as Record<string, unknown>;
            return {
              category: typeof we.category === 'string' ? we.category : '기타',
              title: typeof we.title === 'string' ? we.title : '제목 없음',
              content: typeof we.content === 'string' ? we.content : undefined,
            };
          })
        : fallbackDraft.worldEntries,
      firstChapterOutline: typeof rawDraft.firstChapterOutline === 'string' ? rawDraft.firstChapterOutline : fallbackDraft.firstChapterOutline,
    };

    return { reply, draft };
  }

  return { reply: textWithoutThinkBlocks, draft: fallbackDraft };
}
