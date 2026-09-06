import { describe, expect, it } from 'vitest';
import { readResearchJson, selectCitedResearch, splitResearchContent } from './content';

describe('separate reference metadata from article text', () => {
  it('displays legacy content without the automatically appended source wall', () => {
    const raw = '개방의 기본 설명.\n웹 참고 자료 (검색 요약 기준):\n[웹1] 구파일방 — https://namu.wiki/w/example\n[웹2] 자료 — https://example.org/reference';
    const result = splitResearchContent(raw);
    expect(result.content).toBe('개방의 기본 설명.');
    expect(result.research?.sources).toHaveLength(2);
  });
  it('never hides author notes after an apparent source footer', () => {
    const raw = '설명\n웹 참고 자료 (검색 요약 기준):\n[웹1] 자료 — https://example.org\n작가가 직접 쓴 추가 메모';
    expect(splitResearchContent(raw).content).toBe(raw);
  });
  it('retains only the sources cited for an individual item', () => {
    const research = { status: 'searched' as const, queries: [], sources: [
      { id: '웹1', title: '자료1', url: 'https://example.org/one', snippet: '' },
      { id: '웹2', title: '자료2', url: 'https://example.org/two', snippet: '' },
    ] };
    expect(selectCitedResearch(research, ['웹2'])?.sources.map((source) => source.id)).toEqual(['웹2']);
    expect(selectCitedResearch(research, [])).toBeUndefined();
    expect(readResearchJson(JSON.stringify({ ...research, sources: [{ id: 'x', title: 'unsafe', url: 'javascript:alert(1)' }] }))?.sources).toEqual([]);
  });
});
