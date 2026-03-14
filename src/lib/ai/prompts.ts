import type { characters, projects, worldEntries } from '@/lib/db/schema';

type Project = typeof projects.$inferSelect;
type Character = typeof characters.$inferSelect;
type WorldEntry = typeof worldEntries.$inferSelect;

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

  // 기본 시스템 프롬프트
  sections.push(
    '당신은 한국어 소설 작성 보조 AI입니다. 다음 소설의 다음 문장을 자연스럽게 이어서 작성하세요.'
  );

  // 프로젝트 정보
  const projectLines: string[] = [`- 제목: ${project.title}`];
  if (project.genre) {
    projectLines.push(`- 장르: ${project.genre}`);
  }
  if (project.synopsis) {
    projectLines.push(`- 시놉시스: ${project.synopsis}`);
  }
  sections.push(`\n[작품 정보]\n${projectLines.join('\n')}`);

  // 등장인물 정보 (비어있지 않을 때만)
  if (characterList.length > 0) {
    const charLines = characterList.map((c) => {
      const parts = [`- ${c.name}`];
      if (c.role) parts.push(`(${c.role})`);
      return parts.join(' ');
    });
    sections.push(`\n[등장인물]\n${charLines.join('\n')}`);
  }

  // 세계관 정보 (비어있지 않을 때만)
  if (worldEntryList.length > 0) {
    const worldLines = worldEntryList.map((w) => `- [${w.category}] ${w.title}`);
    sections.push(`\n[세계관]\n${worldLines.join('\n')}`);
  }

  return sections.join('\n');
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
