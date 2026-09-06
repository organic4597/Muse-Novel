'use client';

import { useDeferredValue, useMemo, useState } from 'react';

import { Input } from '@/components/ui/input';

export type WorldSearchEntry = {
  id: string;
  title: string;
  category: string;
  content: string | null;
  tags?: Array<{ id: string; tag: string }>;
};

type SearchDocument = {
  entry: WorldSearchEntry;
  title: string;
  category: string;
  content: string;
  tags: string[];
  searchableText: string;
};

const MAX_RESULTS = 50;

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR');
}

function createSearchDocument(entry: WorldSearchEntry): SearchDocument {
  const title = normalizeSearchText(entry.title);
  const category = normalizeSearchText(entry.category);
  const content = normalizeSearchText(entry.content ?? '');
  const tags = (entry.tags ?? []).map(({ tag }) => normalizeSearchText(tag));

  return {
    entry,
    title,
    category,
    content,
    tags,
    searchableText: [title, category, content, ...tags].join('\n'),
  };
}

function getMatchScore(document: SearchDocument, terms: string[]): number | null {
  let score = 0;

  for (const term of terms) {
    if (!document.searchableText.includes(term)) {
      return null;
    }

    if (document.title === term) score += 120;
    else if (document.title.startsWith(term)) score += 80;
    else if (document.title.includes(term)) score += 60;

    if (document.tags.some((tag) => tag === term)) score += 45;
    else if (document.tags.some((tag) => tag.includes(term))) score += 30;

    if (document.category === term) score += 25;
    else if (document.category.includes(term)) score += 15;

    if (document.content.includes(term)) score += 5;
  }

  return score;
}

function getContentPreview(content: string | null): string {
  if (!content) return '';
  return content.length > 80 ? `${content.slice(0, 80)}...` : content;
}

export function WorldSearch({
  entries,
  onSelectEntry,
}: {
  entries: WorldSearchEntry[];
  onSelectEntry?: (entryId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const searchDocuments = useMemo(
    () => entries.map(createSearchDocument),
    [entries]
  );
  const trimmedQuery = deferredQuery.trim();
  const results = useMemo(() => {
    if (!trimmedQuery) return [];

    const terms = normalizeSearchText(trimmedQuery)
      .split(/\s+/u)
      .filter(Boolean);

    return searchDocuments
      .map((document, index) => ({
        document,
        index,
        score: getMatchScore(document, terms),
      }))
      .filter(
        (
          result
        ): result is typeof result & {
          score: number;
        } => result.score !== null
      )
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, MAX_RESULTS)
      .map(({ document }) => document.entry);
  }, [searchDocuments, trimmedQuery]);
  const isSearching = query !== deferredQuery;
  const hasSearched = trimmedQuery.length > 0;

  return (
    <div aria-busy={isSearching} className="space-y-2">
      <label className="sr-only" htmlFor="world-entry-search">
        세계관 항목 검색
      </label>
      <Input
        id="world-entry-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="제목, 분류, 내용 또는 태그 검색"
        type="search"
        value={query}
      />

      <div aria-atomic="true" aria-live="polite" className="min-h-4" role="status">
        {isSearching && (
          <p className="text-xs text-muted-foreground">검색 중...</p>
        )}

        {hasSearched && !isSearching && results.length === 0 && (
          <p className="text-sm text-muted-foreground">검색 결과가 없습니다</p>
        )}

        {hasSearched && !isSearching && results.length > 0 && (
          <p className="sr-only">검색 결과 {results.length}개</p>
        )}
      </div>

      {results.length > 0 && (
        <ul aria-label="세계관 검색 결과" className="space-y-1">
          {results.map((entry) => (
            <li key={entry.id}>
              <button
                className="w-full rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelectEntry?.(entry.id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{entry.title}</span>
                  <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {entry.category}
                  </span>
                </div>
                {entry.content && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {getContentPreview(entry.content)}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
