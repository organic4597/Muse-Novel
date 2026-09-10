import { generateText, Output } from 'ai';
import { z } from 'zod';

import { createProvider } from '@/lib/ai/provider-factory';
import { formatPromptData } from '@/lib/ai/prompt-foundations';
import { getProviderOptions } from '@/lib/ai/provider-options';
import { runAIRequest } from '@/lib/ai/request-scheduler';
import { resolveProjectProvider } from '@/lib/ai/resolve-project-provider';
import type { DB } from '@/lib/db';
import { listChapters } from '@/lib/db/queries/chapters';
import { getCharacter } from '@/lib/db/queries/characters';
import { extractBoundedPlateText } from '@/lib/editor/bounded-plate-content';

export const characterVoiceExampleSchema = z.object({
  quote: z.string().trim().min(1).max(1000),
  note: z.string().trim().max(1000).default(''),
});

export const characterVoiceProfileSchema = z.object({
  guide: z.string().trim().min(1).max(3000),
  examples: z.array(characterVoiceExampleSchema).min(1).max(8),
});

export type CharacterVoiceProfile = z.infer<typeof characterVoiceProfileSchema>;

type ChapterText = { title: string; contentJson: string | null };

export function collectCharacterVoiceExcerpts(
  chapters: ChapterText[],
  characterName: string,
  maxChars = 24_000
) {
  const excerpts: string[] = [];
  let remaining = maxChars;
  for (const chapter of chapters) {
    if (remaining <= 0) break;
    let prose = '';
    try {
      prose = extractBoundedPlateText(chapter.contentJson ?? undefined);
    } catch {
      continue;
    }
    if (!prose.includes(characterName)) continue;
    const indices: number[] = [];
    let cursor = 0;
    while (indices.length < 6) {
      const found = prose.indexOf(characterName, cursor);
      if (found < 0) break;
      indices.push(found);
      cursor = found + characterName.length;
    }
    for (const index of indices) {
      if (remaining <= 0) break;
      const start = Math.max(0, index - 1200);
      const end = Math.min(prose.length, index + characterName.length + 2400);
      const excerpt = `## ${chapter.title}\n${prose.slice(start, end)}`.slice(
        0,
        remaining
      );
      if (excerpt && !excerpts.some((item) => item.includes(excerpt))) {
        excerpts.push(excerpt);
        remaining -= excerpt.length;
      }
    }
  }
  return excerpts.join('\n\n');
}

export function validateCharacterVoiceProfile(
  corpus: string,
  value: unknown
): CharacterVoiceProfile | null {
  const parsed = characterVoiceProfileSchema.safeParse(value);
  if (!parsed.success) return null;
  const examples = parsed.data.examples.filter(
    (example, index, all) =>
      corpus.includes(example.quote) &&
      all.findIndex((candidate) => candidate.quote === example.quote) === index
  );
  if (!examples.length) return null;
  return { guide: parsed.data.guide, examples };
}

export async function extractCharacterVoiceProfile({
  characterId,
  db,
  progress,
  projectId,
  signal,
}: {
  characterId: string;
  db: DB;
  progress?: (message: string) => void;
  projectId: string;
  signal: AbortSignal;
}) {
  const character = await getCharacter(db, characterId);
  if (!character || character.projectId !== projectId) {
    throw new Error('CHARACTER_NOT_FOUND');
  }
  const chapters = await listChapters(db, projectId);
  const corpus = collectCharacterVoiceExcerpts(chapters, character.name);
  if (corpus.length < 80) throw new Error('INSUFFICIENT_VOICE_EVIDENCE');

  const providerConfig = await resolveProjectProvider(db, projectId);
  if (!providerConfig) throw new Error('AI 제공자 설정이 없습니다.');
  progress?.(`${character.name}이(가) 등장하는 원고 문맥을 읽고 말투 근거를 찾는 중...`);
  const result = await runAIRequest(
    providerConfig,
    { priority: 'standard', projectId, signal },
    (abortSignal) => generateText({
      abortSignal,
      maxRetries: 0,
      maxOutputTokens: 2400,
      model: createProvider(providerConfig),
      output: Output.object({
        description: '실제 원고 인용에 근거한 캐릭터 목소리 후보',
        name: 'character_voice_profile',
        schema: characterVoiceProfileSchema,
      }),
      providerOptions: getProviderOptions(providerConfig, {
        disableReasoning: providerConfig.provider === 'qwen-local',
      }),
      system: '한국어 장편소설의 인물 목소리를 분석합니다. 원고에서 확인할 수 없는 성격이나 말투는 추측하지 않습니다.',
      prompt: [
        `등장인물 ${character.name}의 실제 발화와 발화 전후 행동만 근거로 재사용 가능한 목소리 규칙을 만든다.`,
        'guide에는 존대/반말과 호칭, 문장 길이·종결 습관, 어휘, 질문·회피·압박 방식, 감정이 새는 방식을 구체적으로 정리한다. 성격 소개나 줄거리 요약으로 대신하지 않는다.',
        'examples.quote는 제공된 원고에서 연속된 문자열을 글자 하나도 바꾸지 말고 그대로 복사한다. 누가 말했는지 불분명한 대사는 제외한다. note에는 그 예문이 보여주는 규칙만 설명한다.',
        '근거가 적으면 개수를 채우지 않는다. 출력은 JSON 객체 하나뿐이다.',
        formatPromptData('character_record', JSON.stringify({
          name: character.name,
          role: character.role,
          personality: character.personality,
          existingVoiceGuide: character.voiceGuide,
        })),
        formatPromptData('manuscript_excerpts', corpus),
      ].join('\n\n'),
      temperature: 0.15,
    })
  );
  const profile = validateCharacterVoiceProfile(corpus, result.output);
  if (!profile) throw new Error('INSUFFICIENT_VOICE_EVIDENCE');
  return {
    ...profile,
    reviewedChars: corpus.length,
    sourceChapters: chapters.filter((chapter) => {
      try {
        return extractBoundedPlateText(chapter.contentJson ?? undefined).includes(character.name);
      } catch {
        return false;
      }
    }).length,
  };
}
