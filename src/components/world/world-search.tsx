'use client';

import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

type SearchResult = {
  id: string;
  title: string;
  category: string;
  content: string | null;
};

export function WorldSearch({
  projectId,
  onSelectEntry,
}: {
  projectId: string;
  onSelectEntry?: (entryId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/world-entries/search?q=${encodeURIComponent(trimmed)}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setHasSearched(true);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [query, projectId]);

  const getContentPreview = (content: string | null) => {
    if (!content) return '';
    return content.length > 80 ? content.slice(0, 80) + '...' : content;
  };

  return (
    <div className="space-y-2">
      <Input
        onChange={(e) => setQuery(e.target.value)}
        placeholder="검색어를 입력하세요"
        type="search"
        value={query}
      />

      {isSearching && (
        <p className="text-xs text-muted-foreground">검색 중...</p>
      )}

      {hasSearched && !isSearching && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          검색 결과가 없습니다
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((entry) => (
            <button
              className="w-full rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted"
              key={entry.id}
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
          ))}
        </div>
      )}
    </div>
  );
}
