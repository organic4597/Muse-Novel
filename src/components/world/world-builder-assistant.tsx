'use client';

import { Bot, Check, Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WebResearchSources, WebSearchControl } from '@/components/ai/web-research-controls';
import { Button } from '@/components/ui/button';
import type { WorldBatchReport } from '@/lib/ai/world-request';
import { displayEntityValue, ENTITY_FIELDS } from '@/lib/entity-revisions';
import { selectCitedResearch, splitResearchContent } from '@/lib/web-research/content';
import type { WebResearch, WebSearchMode } from '@/lib/web-research/types';
import { resolveWorldCategoryName, type WorldCategoryRecord } from '@/lib/world-categories';
import type { WorldEditSuggestion, WorldSuggestion } from '@/lib/world-suggestions';

const EXAMPLE_REQUESTS = [
  '중원 무협의 대표 종파 8개를 기본 정보와 함께 추가해줘',
  '이 세계의 주요 지역 5개와 각 지역의 특징을 추가해줘',
  '통용 화폐, 신분 제도, 교통수단을 기본 설정으로 추가해줘',
] as const;

type AssistantResult = {
  research?: WebResearch;
  suggestions: WorldSuggestion[];
  requestedCount: number;
  skippedTitles?: string[];
  report?: WorldBatchReport;
  operation?: 'create' | 'update' | 'mixed';
  editSuggestions?: WorldEditSuggestion[];
};

type ReviewableWorldEdit = WorldEditSuggestion & { status: 'pending' | 'approved' | 'rejected' };

type WorldEntry = {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  tags?: Array<{ id: string; tag: string }>;
};

export function WorldBuilderAssistant({
  projectId,
  onEntriesAdded,
  categoryRecords = [],
}: {
  projectId: string;
  onEntriesAdded?: (entries: WorldEntry[]) => void;
  categoryRecords?: WorldCategoryRecord[];
}) {
  const [instruction, setInstruction] = useState('');
  const [webSearchMode, setWebSearchMode] = useState<WebSearchMode>('auto');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [suggestions, setSuggestions] = useState<WorldSuggestion[]>([]);
  const [editSuggestions, setEditSuggestions] = useState<ReviewableWorldEdit[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const reviewLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/world-entries/assistant`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('검토 대기 후보를 불러오지 못했습니다. 새로고침해주세요.');
        const data = await response.json() as AssistantResult;
        setSuggestions((current) => [...new Map([...data.suggestions, ...current].map((entry) => [entry.id, entry])).values()]);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '후보를 불러오지 못했습니다.');
      });
    return () => { controller.abort(); abortRef.current?.abort(); };
  }, [projectId]);

  const review = async (ids: string[], action: 'approve' | 'reject') => {
    if (!ids.length || reviewLock.current) return;
    reviewLock.current = true;
    setReviewing(true);
    setError('');
    setReviewMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/world-entries/assistant/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionIds: ids, action }),
      });
      const data = await response.json() as { suggestions: WorldSuggestion[]; entries: WorldEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? '검토 결과를 저장하지 못했습니다.');
      const changed = new Map(data.suggestions.map((entry) => [entry.id, entry]));
      setSuggestions((current) => current.map((entry) => changed.get(entry.id) ?? entry));
      if (action === 'approve' && data.entries.length) onEntriesAdded?.(data.entries);
      setReviewMessage(action === 'approve'
        ? `${data.entries.length}개 항목을 승인하여 세계관에 반영했습니다.`
        : `${data.suggestions.length}개 후보를 거부했습니다. 세계관에는 추가되지 않았습니다.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '검토 결과를 저장하지 못했습니다.');
    } finally {
      reviewLock.current = false;
      setReviewing(false);
    }
  };

  const reviewEdit = async (entry: ReviewableWorldEdit, action: 'approve' | 'reject') => {
    if (reviewing || entry.status !== 'pending') return;
    if (action === 'reject') {
      setEditSuggestions((current) => current.map((item) => item.entryId === entry.entryId ? { ...item, status: 'rejected' } : item));
      setReviewMessage(`“${entry.title}” 수정안을 반영하지 않았습니다. 기존 설정은 유지됩니다.`);
      return;
    }
    setReviewing(true); setError(''); setReviewMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/entity-edits/world/${entry.entryId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', baseVersion: entry.baseVersion, changes: entry.changes }),
      });
      const data = await response.json() as { entry?: WorldEntry; error?: string };
      if (!response.ok || !data.entry) throw new Error(data.error ?? '기존 항목 수정안을 저장하지 못했습니다.');
      setEditSuggestions((current) => current.map((item) => item.entryId === entry.entryId ? { ...item, status: 'approved' } : item));
      onEntriesAdded?.([data.entry]);
      setReviewMessage(`“${entry.title}” 수정안을 승인해 반영했습니다. 수정 전 내용은 이력에 보관했습니다.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '기존 항목 수정안을 저장하지 못했습니다.');
    } finally {
      setReviewing(false);
    }
  };

  const batches = new Map<string, WorldSuggestion[]>();
  for (const suggestion of suggestions) {
    const batch = batches.get(suggestion.batchId) ?? [];
    batch.push(suggestion);
    batches.set(suggestion.batchId, batch);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!instruction.trim() || isGenerating || abortRef.current) return;

    setIsGenerating(true);
    setError('');
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(
        `/api/projects/${projectId}/world-entries/assistant`,
        {
          body: JSON.stringify({ instruction: instruction.trim(), webSearchMode }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? '세계관 항목을 생성하지 못했습니다.');
      }

      const assistantResult = data as AssistantResult;
      setResult(assistantResult);
      setSuggestions((current) => [...assistantResult.suggestions, ...current]);
      setEditSuggestions((assistantResult.editSuggestions ?? []).map((entry) => ({ ...entry, status: 'pending' })));
      setInstruction('');
    } catch (caughtError) {
      setError(
        controller.signal.aborted ? '후보 생성을 중단했습니다.' : caughtError instanceof Error
          ? caughtError.message
          : '세계관 항목을 생성하지 못했습니다.'
      );
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  return (
    <section className="muse-panel relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="muse-eyebrow flex items-center gap-1.5">
            <Sparkles className="size-3" />
            World assistant
          </p>
          <h2 className="mt-1.5 font-heading text-lg font-semibold">세계관 항목 자동 구축</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            검색 자료를 참고해 후보를 만들고, 작가가 승인한 항목만 세계관에 반영합니다.
          </p>
        </div>
      </div>

      <form className="relative mt-4 space-y-3" onSubmit={handleSubmit}>
        <WebSearchControl disabled={isGenerating} onChange={setWebSearchMode} value={webSearchMode} />
        <label className="sr-only" htmlFor="world-assistant-instruction">
          세계관 어시스턴트 요청
        </label>
        <textarea
          className="min-h-24 w-full resize-y rounded-xl border border-input bg-card/75 px-4 py-3 text-sm leading-6 outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
          disabled={isGenerating}
          id="world-assistant-instruction"
          maxLength={5000}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="예: 중원 무협의 대표 종파 8개를 기본 정보와 함께 추가해줘"
          value={instruction}
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_REQUESTS.map((example) => (
            <button
              className="rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
              disabled={isGenerating}
              key={example}
              onClick={() => setInstruction(example)}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            한 번에 최대 20개 후보를 만듭니다. 승인 전에는 확정 설정이나 AI 작품 기억에 포함되지 않습니다.
          </p>
          <Button disabled={!instruction.trim() || isGenerating} type="submit">
            <Send />
            {isGenerating ? '후보 생성 중...' : '후보 생성'}
          </Button>
          {isGenerating && <Button onClick={() => abortRef.current?.abort()} type="button" variant="outline">생성 중단</Button>}
        </div>
      </form>

      <div aria-live="polite" className="relative">
        {isGenerating && (
          <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            기존 세계관을 확인하고 새 항목을 구성하고 있습니다...
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {result && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <p className="font-medium">
              {result.report
                ? `요청 ${result.report.requestedCount}개 · 기존 ${result.report.existingTitles.length}개 · 수정 후보 ${editSuggestions.length}개 · 검토 대기 ${result.report.pendingTitles.length}개 · 새 후보 ${result.suggestions.length}개 · 누락 ${result.report.missingTitles.length}개`
                : `${result.suggestions.length}개의 검토 후보를 만들었습니다. 승인할 항목을 선택해주세요.`}
            </p>
            {result.report?.missingTitles.length ? <p className="mt-2 text-amber-700 dark:text-amber-300">아직 완성되지 않았습니다. 누락: {result.report.missingTitles.join(', ')}</p> : null}
            {result.report?.warnings.length ? <p className="mt-2 text-xs text-muted-foreground">{result.report.warnings.join(' ')}</p> : null}
            {result.suggestions.length === 0 && <WebResearchSources research={result.research} />}
            {result.suggestions.length === 0 && result.report?.missingTitles.length ? <button className="mt-2 text-xs underline" onClick={() => setInstruction(result.report?.instruction ?? '')} type="button">보완 요청 불러오기</button> : null}
            {(result.skippedTitles?.length ?? 0) > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                기존 항목과 중복되어 제외: {result.skippedTitles?.join(', ')}
              </p>
            )}
            {result.operation === 'update' && editSuggestions.length === 0 && <p className="mt-2 text-xs text-muted-foreground">기존 항목을 찾았지만 실제로 달라지는 수정안을 만들지 못했습니다. 대상과 바꿀 내용을 더 구체적으로 적어주세요.</p>}
          </div>
        )}
        {reviewMessage && <p className="mt-3 text-sm text-muted-foreground" role="status">{reviewMessage}</p>}
        {editSuggestions.length > 0 && <section className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div><h3 className="font-semibold">기존 항목 수정 후보 {editSuggestions.length}개</h3><p className="mt-1 text-xs text-muted-foreground">변경 전·후를 확인하고 승인한 항목만 수정합니다. 승인 시 이전 내용은 수정 이력에 보관됩니다.</p></div>
          <div className="space-y-3">
            {editSuggestions.map((entry) => <article aria-label={`${entry.title} 기존 항목 수정 후보`} className="rounded-xl border border-border bg-background/70 p-3" key={entry.entryId}>
              <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{entry.title}</h4><span className="rounded-full bg-secondary px-2 py-0.5 text-xs">기존 항목 수정</span>{entry.status !== 'pending' && <span className="text-xs text-muted-foreground">{entry.status === 'approved' ? '승인됨 · 수정 반영' : '거부됨 · 기존 설정 유지'}</span>}</div>
              {entry.note && <p className="mt-2 text-sm">{entry.note}</p>}
              <div className="mt-3 space-y-3">{Object.entries(entry.changes).filter(([key]) => key !== 'researchJson').map(([key, value]) => <div key={key}>
                <h5 className="text-xs font-medium text-muted-foreground">{ENTITY_FIELDS.world[key] ?? key}</h5>
                <div className="mt-1 grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-border p-3"><p className="mb-1 text-xs text-muted-foreground">변경 전</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{displayEntityValue(key, entry.before[key])}</p></div><div className="rounded-lg border border-primary/25 bg-primary/5 p-3"><p className="mb-1 text-xs text-muted-foreground">변경 후</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{displayEntityValue(key, value)}</p></div></div>
              </div>)}</div>
              <WebResearchSources research={entry.research} />
              {entry.status === 'pending' && <div className="mt-3 flex gap-2"><Button disabled={reviewing} onClick={() => void reviewEdit(entry, 'approve')} size="sm" type="button"><Check />수정 승인</Button><Button disabled={reviewing} onClick={() => void reviewEdit(entry, 'reject')} size="sm" type="button" variant="outline"><X />수정 거부</Button></div>}
            </article>)}
          </div>
        </section>}
        {Array.from(batches, ([batchId, batch]) => {
          const pendingIds = batch.filter((entry) => entry.status === 'pending').map((entry) => entry.id);
          return (
            <section className="mt-4 space-y-3 rounded-xl border border-border bg-background/60 p-4" key={batchId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">검토 후보 {batch.length}개 · 대기 {pendingIds.length}개</h3>
                {pendingIds.length > 0 && <div className="flex gap-2">
                  <Button disabled={reviewing} onClick={() => void review(pendingIds, 'approve')} size="sm" type="button">이 후보들 모두 승인</Button>
                  <Button disabled={reviewing} onClick={() => void review(pendingIds, 'reject')} size="sm" type="button" variant="outline">이 후보들 모두 거부</Button>
                </div>}
              </div>
              <WebResearchSources research={batch[0]?.research} />
              {batch[0]?.report && <div className="space-y-1 text-xs text-muted-foreground">
                <p>요청 {batch[0].report.requestedCount}개 · 기존 {batch[0].report.existingTitles.length}개 · 이전 검토 대기 {batch[0].report.pendingTitles.length}개</p>
                {batch[0].report.note && <p>{batch[0].report.note}</p>}
                <details>
                  <summary className="cursor-pointer py-1">해석한 대상 명단 {batch[0].report.expectedTitles.length}개</summary>
                  <p className="py-1 leading-6">{batch[0].report.expectedTitles.join(', ')}</p>
                </details>
                {batch[0].report.missingTitles.length > 0 && <p className="text-amber-700 dark:text-amber-300">누락: {batch[0].report.missingTitles.join(', ')} <button className="underline" onClick={() => setInstruction(batch[0].report?.instruction ?? '')} type="button">보완 요청 불러오기</button></p>}
              </div>}
              <div className="grid gap-3 lg:grid-cols-2">
                {batch.map((entry) => (
                  <article aria-label={`${entry.title} 검토 후보`} className="muse-render-lazy rounded-xl border border-border p-3" key={entry.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{entry.title}</h4>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{resolveWorldCategoryName(categoryRecords, entry.category)}</span>
                      {entry.status !== 'pending' && <span className="text-xs text-muted-foreground">{entry.status === 'approved' ? '승인됨 · 세계관 반영' : '거부됨 · 미반영'}</span>}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{splitResearchContent(entry.content).content || '내용 없음'}</p>
                    {entry.sourceIds && entry.sourceIds.length > 0 && <WebResearchSources label="이 항목의 출처" research={selectCitedResearch(entry.research, entry.sourceIds)} />}
                    {entry.sourceIds?.length === 0 && <p className="mt-2 text-xs text-muted-foreground">이 항목에 직접 연결된 검색 근거가 없습니다. 내용 확인이 필요합니다.</p>}
                    <p className="mt-2 text-xs text-muted-foreground">{entry.tags.map((tag) => `#${tag}`).join(' ')}</p>
                    {entry.status === 'pending' && <div className="mt-3 flex gap-2">
                      <Button disabled={reviewing} onClick={() => void review([entry.id], 'approve')} size="sm" type="button"><Check />승인</Button>
                      <Button disabled={reviewing} onClick={() => void review([entry.id], 'reject')} size="sm" type="button" variant="outline"><X />거부</Button>
                    </div>}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
