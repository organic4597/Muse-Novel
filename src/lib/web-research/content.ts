import type { WebResearch, WebSource } from './types';

/** Read-only compatibility for the source footer emitted by older versions. */
export function splitResearchContent(value: string | null | undefined): { content: string; research?: WebResearch } {
  const content = value ?? '';
  const marker = /(?:^|\n)웹 참고 자료 \(검색 요약 기준\):\r?\n/u.exec(content);
  if (!marker) return { content };
  const lines = content.slice(marker.index + marker[0].length).trim().split(/\r?\n/).filter(Boolean);
  const sources: WebSource[] = [];
  for (const line of lines) {
    const match = /^\[(웹\d+)\]\s+(.+?)\s+—\s+(https?:\/\/\S+)$/u.exec(line);
    if (!match) return { content }; // Never hide author text after a source list.
    try {
      const url = new URL(match[3]);
      if (url.username || url.password) return { content };
      sources.push({ id: match[1], title: match[2], url: url.href, snippet: '' });
    } catch { return { content }; }
  }
  if (!sources.length) return { content };
  return { content: content.slice(0, marker.index).trimEnd(), research: { status: 'searched', queries: [], sources } };
}

export function readResearchJson(value?: string | null): WebResearch | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as WebResearch;
    if (!parsed || !['searched', 'skipped', 'unavailable'].includes(parsed.status) || !Array.isArray(parsed.sources) || !Array.isArray(parsed.queries)) return undefined;
    return { ...parsed,
      queries: parsed.queries.filter((query) => typeof query === 'string').slice(0, 10),
      sources: parsed.sources.filter((source) => {
        if (!source || typeof source.id !== 'string' || typeof source.title !== 'string' || typeof source.url !== 'string') return false;
        try {
          const url = new URL(source.url);
          return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
        } catch { return false; }
      }).slice(0, 20),
    };
  } catch { return undefined; }
}

export function selectCitedResearch(research: WebResearch | undefined, sourceIds?: string[] | null): WebResearch | undefined {
  if (!research) return undefined;
  if (sourceIds == null) return research; // Legacy records have no item-level attribution.
  const sources = research.sources.filter((source) => sourceIds.includes(source.id));
  if (!sources.length) return undefined;
  return { ...research, sources };
}
