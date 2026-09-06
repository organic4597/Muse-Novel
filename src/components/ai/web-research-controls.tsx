'use client';

import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { WebResearch, WebSearchMode } from '@/lib/web-research/types';

export function WebSearchControl({ value, onChange, disabled }: {
  value: WebSearchMode;
  onChange: (value: WebSearchMode) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor={id}>웹 검색</label>
      <select className="rounded-lg border border-input bg-card px-2 py-1.5 text-foreground" disabled={disabled} id={id}
        onChange={(event) => onChange(event.target.value as WebSearchMode)} value={value}>
        <option value="auto">필요할 때 자동</option>
        <option value="always">항상 검색</option>
        <option value="off">끄기</option>
      </select>
      <span>검색어만 외부 검색엔진에 전달됩니다.</span>
    </div>
  );
}

export function WebResearchSources({ research, label = '검색 내역' }: { research?: WebResearch; label?: string }) {
  if (!research || research.status === 'skipped') return null;
  return (
    <div className="mt-2 text-xs">
      {research.warning && <p className="text-amber-700 dark:text-amber-300">{research.warning}</p>}
      {research.sources.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button className="h-8 text-xs" size="sm" type="button" variant="outline">{label} {research.sources.length}개 <ChevronDown className="size-3" /></Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] text-xs">
          <p className="font-medium">{label} · 검색 요약 기준</p>
          {research.queries.length > 0 && <p className="my-2 break-words text-muted-foreground">검색어: {research.queries.join(' · ')}</p>}
          <ul className="space-y-1.5">
            {research.sources.map((source) => (
              <li key={source.id}>
                <a className="line-clamp-2 text-primary underline underline-offset-2" href={source.url} rel="noopener noreferrer" target="_blank" title={source.title}>
                  [{source.id}] {source.title}
                </a>
                {source.sourceKind && <span className="ml-2 text-muted-foreground">{source.sourceKind}</span>}
              </li>
            ))}
          </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
