import type { DB } from '@/lib/db';
import { getChapterReferences } from '@/lib/db/queries/chapter-references';
import {
  getChapterSummary,
  listChapterSummaries,
} from '@/lib/db/queries/chapters';
import { getAffiliationSummariesAt } from '@/lib/db/queries/character-affiliations';
import { listCharacters } from '@/lib/db/queries/characters';
import { getProject } from '@/lib/db/queries/projects';
import { listStoryStateEntries } from '@/lib/db/queries/story-state';
import { listWorldEntries } from '@/lib/db/queries/world-entries';
import { splitResearchContent } from '@/lib/web-research/content';
import {
  getInitialStoryIdea,
  getWritingBlueprint,
} from './writing-blueprint';

const BACKSTORY_LIMIT = 300;
const CONTENT_LIMIT = 300;

type StoryContextOptions = {
  focusText?: string;
  maxChars?: number;
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  return text.slice(0, maxLen - 1) + '…';
}

/**
 * DB에서 프로젝트/등장인물/세계관/챕터 정보를 조회하여
 * AI 시스템 프롬프트에 삽입할 구조화된 한국어 컨텍스트를 생성합니다.
 */
export async function buildStoryContext(
  db: DB,
  projectId: string,
  chapterId?: string,
  options: number | StoryContextOptions = 4000
): Promise<string> {
  const maxChars = typeof options === 'number'
    ? options
    : options.maxChars ?? 4000;
  const focusText = typeof options === 'number'
    ? ''
    : options.focusText ?? '';
  const project = await getProject(db, projectId);

  if (!project) {
    return '';
  }

  const sections: string[] = [];
  const relevanceText = focusText;

  // ── 소설 정보 ───────────────────────────────────────────────────────────────
  const projectLines: string[] = [`제목: ${project.title}`];

  if (project.genre) {
    projectLines.push(`장르: ${project.genre}`);
  }
  if (project.synopsis) {
    projectLines.push(`줄거리: ${project.synopsis}`);
  } else {
    const initialIdea = getInitialStoryIdea(project.settingsJson);
    if (initialIdea) projectLines.push(`초기 아이디어: ${initialIdea}`);
  }

  sections.push(`## 소설 정보\n${projectLines.join('\n')}`);

  const blueprint = getWritingBlueprint(project.settingsJson);
  const blueprintLines = [
    blueprint.targetAudience && `주요 독자층: ${blueprint.targetAudience}`,
    blueprint.storyPromise && `핵심 재미/감정 약속: ${blueprint.storyPromise}`,
    blueprint.tone && `톤: ${blueprint.tone}`,
    blueprint.pointOfView && `서술 시점: ${blueprint.pointOfView}`,
    blueprint.narrativeTense && `서술 시제: ${blueprint.narrativeTense}`,
    blueprint.writingStyle && `문체 규칙: ${blueprint.writingStyle}`,
    blueprint.formatGoal && `분량/형식: ${blueprint.formatGoal}`,
    blueprint.endingDirection && `결말 방향: ${blueprint.endingDirection}`,
    blueprint.contentBoundaries && `소재/수위 경계: ${blueprint.contentBoundaries}`,
  ].filter((line): line is string => Boolean(line));

  if (blueprintLines.length > 0) {
    sections.push(`## 집필 기준\n${blueprintLines.join('\n')}`);
  }

  // ── 현재 챕터 ───────────────────────────────────────────────────────────────
  if (chapterId) {
    const chapter = await getChapterSummary(db, chapterId);

    if (chapter) {
      const chapterLines: string[] = [`제목: ${chapter.title}`];

      if (chapter.outline) {
        chapterLines.push(`개요: ${chapter.outline}`);
      }
      if (chapter.summary) {
        chapterLines.push(`요약: ${chapter.summary}`);
      }

      sections.push(`## 현재 챕터\n${chapterLines.join('\n')}`);

      // ── 이전 챕터 요약 (최대 3개) ───────────────────────────────────────────
      const allChapters = await listChapterSummaries(db, projectId);
      const currentIndex = allChapters.findIndex((c) => c.id === chapterId);
      const prevChapters = currentIndex > 0
        ? allChapters.slice(Math.max(0, currentIndex - 3), currentIndex)
        : [];

      if (prevChapters.length > 0) {
        const prevLines = prevChapters.map((c) => {
          const parts = [`- ${c.title}`];
          if (c.summary) parts.push(`: ${truncate(c.summary, 120)}`);
          return parts.join('');
        });
        sections.push(`## 이전 챕터 요약\n${prevLines.join('\n')}`);
      }
    }
  }

  // ── 등장인물 ────────────────────────────────────────────────────────────────
  const [characterList, worldEntryList, storyStateList, chapterReferences, timelineChapters] = await Promise.all([
    listCharacters(db, projectId),
    listWorldEntries(db, projectId),
    listStoryStateEntries(db, projectId, { activeOnly: true }),
    chapterId ? getChapterReferences(db, projectId, chapterId) : null,
    listChapterSummaries(db, projectId),
  ]);
  const currentChapterOrder = chapterId ? timelineChapters.find((chapter) => chapter.id === chapterId)?.order : undefined;
  const chapterOrderById = new Map(timelineChapters.map((chapter) => [chapter.id, chapter.order]));
  const effectiveStoryStates = currentChapterOrder === undefined ? storyStateList : storyStateList.filter((entry) => {
    if (!entry.chapterId) return true;
    const order = chapterOrderById.get(entry.chapterId);
    return order !== undefined && order !== null && order <= currentChapterOrder;
  });
  const affiliationsByCharacter = chapterId
    ? getAffiliationSummariesAt(db, projectId, characterList.map((character) => character.id), chapterId)
    : new Map();

  if (characterList.length > 0) {
    const sorted = [...characterList].sort((a, b) => {
      const aM = relevanceText.includes(a.name) ? 1 : 0;
      const bM = relevanceText.includes(b.name) ? 1 : 0;
      return bM - aM;
    });

    const charLines = sorted.map((c) => {
      const parts: string[] = [];
      const nameRole = c.role ? `${c.name} (${c.role})` : c.name;

      const details: string[] = [];

      if (c.personality) {
        details.push(c.personality);
      }
      if (c.backstory) {
        details.push(truncate(c.backstory, BACKSTORY_LIMIT));
      }
      const affiliations = affiliationsByCharacter.get(c.id) ?? [];
      if (affiliations.length) details.push(`소속: ${affiliations.map((affiliation) => `${affiliation.organizationTitle}${affiliation.position ? ` · ${affiliation.position}` : ''}`).join(', ')}`);

      if (details.length > 0) {
        parts.push(`- ${nameRole}: ${details.join(' / ')}`);
      } else {
        parts.push(`- ${nameRole}`);
      }

      return parts.join('');
    });

    sections.push(`## 등장인물\n${charLines.join('\n')}`);
  }

  // ── 세계관 ──────────────────────────────────────────────────────────────────
  if (worldEntryList.length > 0) {
    const sortedWorldEntries = [...worldEntryList].sort((a, b) => {
      const aMentioned = relevanceText.includes(a.title) ? 1 : 0;
      const bMentioned = relevanceText.includes(b.title) ? 1 : 0;
      return bMentioned - aMentioned;
    });
    const worldLines = sortedWorldEntries.map((w) => {
      const header = `- ${w.title} (${w.category})`;

      if (w.content) {
        return `${header}: ${truncate(splitResearchContent(w.content).content, CONTENT_LIMIT)}`;
      }

      return header;
    });

    sections.push(`## 세계관\n${worldLines.join('\n')}`);
  }

  // 작가가 직접 지정한 현재 정전은 일반 자료보다 높은 우선순위로 보존합니다.
  const referenceSection = chapterReferences?.references.length
    ? `## 이번 화 등장 항목 (작가 지정)\n${chapterReferences.references.map((entry) => {
        const presence = entry.presence === 'appears' ? '직접 등장' : '언급만';
        const affiliation = entry.affiliations?.length
          ? ` / 소속: ${entry.affiliations.map((item) => `${item.organizationTitle}${item.position ? ` · ${item.position}` : ''}`).join(', ')}`
          : '';
        return `- [${entry.group} / ${presence}] ${entry.title}${affiliation}${entry.note ? ` / 메모: ${truncate(entry.note, 200)}` : ''}`;
      }).join('\n')}`
    : '';
  const stateSection = effectiveStoryStates.length > 0
    ? `## 지속 상태 메모 (현재 회차에 유효)\n${[...effectiveStoryStates]
        .sort((left, right) => {
          const leftRelevant = [left.characterName, left.label]
            .filter(Boolean)
            .some((value) => relevanceText.includes(value as string));
          const rightRelevant = [right.characterName, right.label]
            .filter(Boolean)
            .some((value) => relevanceText.includes(value as string));
          return Number(rightRelevant) - Number(leftRelevant);
        })
        .slice(0, 30)
        .map((entry) => {
          const subject = entry.characterName ?? '작품 전체';
          const transition = entry.previousValue
            ? `${entry.previousValue} → ${entry.value}`
            : entry.value;
          const details = entry.details
            ? ` / 참고: ${truncate(entry.details, 240)}`
            : '';
          const effectiveFrom = entry.chapterTitle
            ? ` / ${entry.chapterTitle}부터`
            : '';
          return `- [${entry.category}] ${subject} · ${entry.label}: ${transition}${effectiveFrom}${details}`;
        })
        .join('\n')}`
    : '';

  // ── 최종 조합 및 truncation ─────────────────────────────────────────────────
  const fullContext = sections.join('\n\n');
  const authorNoteSection = blueprint.authorNote
    ? `## 현재 작가 노트\n${blueprint.authorNote}`
    : '';
  const canonSection = [referenceSection, stateSection].filter(Boolean).join('\n\n');
  const priorityContext = [canonSection, authorNoteSection]
    .filter(Boolean)
    .join('\n\n');
  const completeContext = [fullContext, priorityContext]
    .filter(Boolean)
    .join('\n\n');

  if (completeContext.length <= maxChars) return completeContext;
  if (!priorityContext) return fullContext.slice(0, maxChars);
  if (authorNoteSection.length >= maxChars) {
    return authorNoteSection.slice(0, maxChars);
  }

  if (priorityContext.length >= maxChars) {
    const canonBudget = Math.max(0, maxChars - authorNoteSection.length - 2);
    return [canonSection.slice(0, canonBudget), authorNoteSection]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, maxChars);
  }

  const baseBudget = Math.max(0, maxChars - priorityContext.length - 2);
  return `${fullContext.slice(0, baseBudget)}\n\n${priorityContext}`;
}
