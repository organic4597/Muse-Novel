import type { characters, projects, worldEntries } from '@/lib/db/schema';
import { splitResearchContent } from '@/lib/web-research/content';
import { buildNovelWritingSystemPrompt } from './prompt-foundations';
import { getWritingBlueprint } from './writing-blueprint';

type Project = typeof projects.$inferSelect;
type Character = typeof characters.$inferSelect;
type WorldEntry = Pick<typeof worldEntries.$inferSelect, 'category' | 'title' | 'content'>;

/**
 * 한국어 소설 작성을 위한 시스템 프롬프트를 생성합니다.
 * 프로젝트, 등장인물, 세계관 정보를 포함하여 AI가 맥락에 맞는 문장을 생성하도록 합니다.
 */
export function getNovelSystemPrompt(
  project: Project,
  characterList: Character[],
  worldEntryList: WorldEntry[]
): string {
  const sections: string[] = [];

  // 프로젝트 정보
  const projectLines: string[] = [`- 제목: ${project.title}`];
  if (project.genre) {
    projectLines.push(`- 장르: ${project.genre}`);
  }
  if (project.synopsis) {
    projectLines.push(`- 시놉시스: ${project.synopsis}`);
  }
  sections.push(`[작품 정보]\n${projectLines.join('\n')}`);

  // 등장인물 정보 (비어있지 않을 때만)
  if (characterList.length > 0) {
    const charLines = characterList.map((character) => {
      const details = [
        character.role ? `역할: ${character.role}` : null,
        character.personality ? `성격: ${character.personality}` : null,
        character.backstory ? `배경: ${character.backstory.slice(0, 400)}` : null,
        character.voiceGuide ? `말투·목소리: ${character.voiceGuide.slice(0, 700)}` : null,
        character.voiceExamplesJson ? `말투 근거 예문: ${character.voiceExamplesJson.slice(0, 1200)}` : null,
      ].filter(Boolean);
      return `- ${character.name}${details.length > 0 ? ` (${details.join(' / ')})` : ''}`;
    });
    sections.push(`[등장인물]\n${charLines.join('\n')}`);
  }

  // 세계관 정보 (비어있지 않을 때만)
  if (worldEntryList.length > 0) {
    const worldLines = worldEntryList.map((entry) =>
      `- [${entry.category}] ${entry.title}${entry.content ? `: ${splitResearchContent(entry.content).content.slice(0, 400)}` : ''}`
    );
    sections.push(`[세계관]\n${worldLines.join('\n')}`);
  }

  const blueprint = getWritingBlueprint(project.settingsJson);
  const blueprintLines = [
    blueprint.targetAudience && `독자층: ${blueprint.targetAudience}`,
    blueprint.storyPromise && `핵심 재미/감정: ${blueprint.storyPromise}`,
    blueprint.tone && `톤: ${blueprint.tone}`,
    blueprint.pointOfView && `시점: ${blueprint.pointOfView}`,
    blueprint.narrativeTense && `시제: ${blueprint.narrativeTense}`,
    blueprint.writingStyle && `문체: ${blueprint.writingStyle}`,
    blueprint.endingDirection && `결말 방향: ${blueprint.endingDirection}`,
    blueprint.contentBoundaries && `소재/수위 경계: ${blueprint.contentBoundaries}`,
  ].filter((line): line is string => Boolean(line));
  if (blueprintLines.length > 0) {
    sections.push(`[집필 기준]\n${blueprintLines.join('\n')}`);
  }

  return buildNovelWritingSystemPrompt({
    storyContext: sections.join('\n\n'),
    additionalInstruction: blueprint.authorNote,
  });
}

/**
 * 에디터 콘텐츠에서 마지막 maxChars 글자를 추출합니다.
 * Copilot에 전달할 컨텍스트로 사용됩니다.
 */
export function getContextForCopilot(
  editorContent: string,
  maxChars: number = 1500
): string {
  if (editorContent.length <= maxChars) {
    return editorContent;
  }
  return editorContent.slice(-maxChars);
}
