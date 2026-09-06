'use client';

import { ChevronDown, History, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WebResearchSources, WebSearchControl } from '@/components/ai/web-research-controls';
import { Button } from '@/components/ui/button';
import { displayEntityValue, ENTITY_FIELDS, type EntityKind, type EntitySnapshot } from '@/lib/entity-revisions';
import type { WebResearch, WebSearchMode } from '@/lib/web-research/types';

type Revision = { id: number; reason: string; createdAt: string };
type Review = { before: EntitySnapshot; changes: EntitySnapshot; baseVersion: string; revisionId?: number; note?: string; research?: WebResearch };

export function EntityRevisionPanel({ projectId, kind, entityId, onSaved }: {
  projectId: string; kind: EntityKind; entityId: string; onSaved: (entry: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [searchMode, setSearchMode] = useState<WebSearchMode>('off');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Revision[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const active = useRef<AbortController | null>(null);
  const endpoint = `/api/projects/${projectId}/entity-edits/${kind}/${entityId}`;
  useEffect(() => () => active.current?.abort(), []);

  const json = async (signal: AbortSignal, body?: unknown, query = '') => {
    const response = await fetch(`${endpoint}${query}`, { signal,
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? '설정 수정 작업을 완료하지 못했습니다.');
    return data;
  };
  const run = async (label: string, work: (signal: AbortSignal) => Promise<void>) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller; setBusy(label); setError(''); setMessage('');
    try { await work(controller.signal); }
    catch (failure) { setError(controller.signal.aborted ? '작업을 중단했습니다. 승인하지 않은 수정안은 저장되지 않습니다.' : failure instanceof Error ? failure.message : '작업에 실패했습니다.'); }
    finally { active.current = null; setBusy(''); }
  };
  const loadHistory = async (signal: AbortSignal, beforeId?: number) => {
    const data = await json(signal, undefined, beforeId ? `?beforeId=${beforeId}` : '');
    setHistory((current) => beforeId ? [...current, ...data.revisions] : data.revisions);
    setHasMore(data.hasMore);
  };
  const propose = () => run('propose', async (signal) => {
    setReview(null);
    const data = await json(signal, { action: 'propose', instruction: instruction.trim(), webSearchMode: searchMode }) as Review;
    setReview(data); setSelected(Object.keys(data.changes).filter((key) => key !== 'researchJson'));
  });
  const preview = (revisionId: number) => run('preview', async (signal) => {
    setReview(null);
    setReview(await json(signal, undefined, `?revisionId=${revisionId}`));
  });
  const approve = () => run('save', async (signal) => {
    if (!review) return;
    const changes = Object.fromEntries(selected.map((key) => [key, review.changes[key]]));
    if (selected.includes('content') && 'researchJson' in review.changes) changes.researchJson = review.changes.researchJson;
    const data = await json(signal, review.revisionId
      ? { action: 'restore', revisionId: review.revisionId, baseVersion: review.baseVersion }
      : { action: 'apply', changes, baseVersion: review.baseVersion });
    onSaved(data.entry);
    setReview(null);
    setMessage(review.revisionId ? '이전 버전으로 복원했습니다. 복원 직전 상태도 이력에 보관했습니다.' : '승인한 수정 내용을 저장했습니다. 수정 전 내용은 이력에 보관했습니다.');
    await loadHistory(signal);
  });
  const reviewKeys = review ? Object.keys(review.changes) : [];
  const visibleKeys = reviewKeys.filter((key) => key !== 'researchJson' || review?.revisionId);

  return (
    <section className="rounded-xl border border-border bg-muted/20">
      <button aria-expanded={open} className="flex w-full items-center gap-2 p-3 text-left text-sm font-medium" onClick={() => {
        setOpen(!open); if (!open) void run('history', (signal) => loadHistory(signal));
      }} type="button"><WandSparkles className="size-4" />AI로 수정 · 수정 이력<ChevronDown className="ml-auto size-4" /></button>
      {open && <div className="space-y-4 border-t border-border p-3 sm:p-4">
        <p className="text-xs leading-5 text-muted-foreground">선택한 항목만 수정합니다. 다른 항목·이미지·태그·관계는 자동 변경하지 않습니다. 검토 후 승인해야 저장됩니다.</p>
        <label className="block space-y-2 text-sm"><span>기존 설정 수정 요청</span>
          <textarea className="min-h-24 w-full resize-y rounded-lg border border-input bg-background p-3" disabled={Boolean(busy)} maxLength={5000}
            onChange={(event) => setInstruction(event.target.value)} placeholder="예: 기존 내용은 유지하고, 요청한 배경 설정만 보강해줘" value={instruction} />
        </label>
        <WebSearchControl disabled={Boolean(busy)} onChange={setSearchMode} value={searchMode} />
        <div className="flex gap-2">
          <Button disabled={Boolean(busy) || instruction.trim().length < 3} onClick={() => void propose()} size="sm" type="button">{busy === 'propose' ? 'AI 수정안 작성 중...' : '수정안 생성'}</Button>
          {busy === 'propose' && <Button onClick={() => active.current?.abort()} size="sm" type="button" variant="outline">생성 중단</Button>}
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        {review && <div className="space-y-3 rounded-lg border border-primary/30 p-3">
          <h3 className="font-semibold">{review.revisionId ? `이력 #${review.revisionId} 복원 검토` : '변경 전·후 검토'}</h3>
          {review.note && <p className="text-sm">{review.note}</p>}
          {!reviewKeys.length && <p className="text-sm">현재 내용과 다른 수정 사항이 없습니다.</p>}
          {visibleKeys.map((key) => <div className="space-y-2" key={key}>
            <label className="flex items-center gap-2 text-sm font-medium">
              {!review.revisionId && <input checked={selected.includes(key)} disabled={Boolean(busy)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, key] : current.filter((field) => field !== key))} type="checkbox" />}
              {ENTITY_FIELDS[kind][key]}
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[['변경 전', review.before[key]], ['변경 후', review.changes[key]]].map(([label, value]) => <div className="min-w-0 rounded-lg bg-background p-3" key={label}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
                <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{displayEntityValue(key, value)}</p>
              </div>)}
            </div>
          </div>)}
          <WebResearchSources research={review.research} />
          {!review.revisionId && 'researchJson' in review.changes && <p className="text-xs text-muted-foreground">본문을 승인하면 참고 출처도 이번 수정안 기준으로 갱신합니다. 웹을 조회하지 않았다면 기존 출처 연결은 해제됩니다.</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={Boolean(busy) || !reviewKeys.length || (!review.revisionId && !selected.length)} onClick={() => void approve()} size="sm" type="button">{busy === 'save' ? '저장 중...' : review.revisionId ? '이 버전으로 복원' : '선택한 수정 승인·저장'}</Button>
            <Button disabled={Boolean(busy)} onClick={() => setReview(null)} size="sm" type="button" variant="outline">반영하지 않기</Button>
          </div>
        </div>}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-medium"><History className="size-4" />수정 전 이력</h3>
            <Button disabled={Boolean(busy)} onClick={() => void run('history', (signal) => loadHistory(signal))} size="sm" type="button" variant="ghost">이력 새로고침</Button>
          </div>
          {!history.length && <p className="text-xs text-muted-foreground">아직 저장된 이력이 없습니다. 이 기능 적용 이후 기본 설정을 수정하면 이전 내용이 보관됩니다.</p>}
          {history.map((revision) => <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-2" key={revision.id}>
            <p className="text-xs">#{revision.id} · {new Date(revision.createdAt).toLocaleString('ko-KR')}<span className="block text-muted-foreground">{revision.reason}</span></p>
            <Button disabled={Boolean(busy)} onClick={() => void preview(revision.id)} size="sm" type="button" variant="outline">복원 내용 확인</Button>
          </div>)}
          {hasMore && <Button disabled={Boolean(busy)} onClick={() => void run('history', (signal) => loadHistory(signal, history.at(-1)?.id))} size="sm" type="button" variant="outline">이전 이력 더 보기</Button>}
        </div>
      </div>}
    </section>
  );
}
