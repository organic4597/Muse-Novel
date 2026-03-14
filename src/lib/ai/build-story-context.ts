import type { DB } from '@/lib/db';
import { getChapter, listChapters } from '@/lib/db/queries/chapters';
import { listCharacters } from '@/lib/db/queries/characters';
import { getProject } from '@/lib/db/queries/projects';
import { listWorldEntries } from '@/lib/db/queries/world-entries';

const BACKSTORY_LIMIT = 300;
const CONTENT_LIMIT = 300;

// ── TTL 캐시: 빠른 ghost-text 반복 요청 시 DB 재조회 방지 ──────────────────
const CACHE_TTL_MS = 30_000;
const contextCache = new Map<string, { value: string; expires: number }>();

export function invalidateStoryContextCache(projectId?: string): void {
  if (!projectId) {
    contextCache.clear();
    return;
  }
  for (const key of contextCache.keys()) {
    if (key.startsWith(`${projectId}:`)) {
      contextCache.delete(key);
    }
  }
}

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
  maxChars: number = 4000
): Promise<string> {
  const cacheKey = `${projectId}:${chapterId ?? ''}:${maxChars}`;
  const cached = contextCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  const project = await getProject(db, projectId);

  if (!project) {
    return '';
  }

  const sections: string[] = [];

  // ── 소설 정보 ───────────────────────────────────────────────────────────────
  const projectLines: string[] = [`제목: ${project.title}`];

  if (project.genre) {
    projectLines.push(`장르: ${project.genre}`);
  }
  if (project.synopsis) {
    projectLines.push(`줄거리: ${project.synopsis}`);
  }

  sections.push(`## 소설 정보\n${projectLines.join('\n')}`);

  // ── 현재 챕터 ───────────────────────────────────────────────────────────────
  if (chapterId) {
    const chapter = await getChapter(db, chapterId);

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
      const allChapters = await listChapters(db, projectId);
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
  const characterList = await listCharacters(db, projectId);

  if (characterList.length > 0) {
    // 현재 챕터 내용에서 언급된 캐릭터를 우선 정렬
    let chapterText = '';
    if (chapterId) {
      const ch = await getChapter(db, chapterId);
      chapterText = ch?.contentJson ?? '';
    }

    const sorted = [...characterList].sort((a, b) => {
      const aM = chapterText.includes(a.name) ? 1 : 0;
      const bM = chapterText.includes(b.name) ? 1 : 0;
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
  const worldEntryList = await listWorldEntries(db, projectId);

  if (worldEntryList.length > 0) {
    const worldLines = worldEntryList.map((w) => {
      const header = `- ${w.title} (${w.category})`;

      if (w.content) {
        return `${header}: ${truncate(w.content, CONTENT_LIMIT)}`;
      }

      return header;
    });

    sections.push(`## 세계관\n${worldLines.join('\n')}`);
  }

  // ── 최종 조합 및 truncation ─────────────────────────────────────────────────
  const fullContext = sections.join('\n\n');
  const result = fullContext.length <= maxChars ? fullContext : fullContext.slice(0, maxChars);

  contextCache.set(cacheKey, { value: result, expires: Date.now() + CACHE_TTL_MS });

  return result;
}
