'use client';

import { Check, ClipboardCheck, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readLongTask } from '@/lib/client/long-task';
import type { ChapterCloseoutPlan } from '@/lib/chapter-closeout';
import { PLOT_NODE_LABELS } from '@/lib/plot-board';

export type ChapterCloseoutPanelProps = {
  chapterId: string;
  projectId: string;
  beforeAnalyze: () => Promise<boolean>;
  onApplied: (chapter: Record<string, unknown>) => void;
  onClose: () => void;
};

export function ChapterCloseoutPanel({ chapterId, projectId, beforeAnalyze, onApplied, onClose }: ChapterCloseoutPanelProps) {
  const [plan, setPlan] = useState<ChapterCloseoutPlan | null>(null);
  const [stateIds, setStateIds] = useState<string[]>([]);
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [useDate, setUseDate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [abort, setAbort] = useState<AbortController | null>(null);
  const endpoint = `/api/projects/${projectId}/chapters/${chapterId}/closeout`;

  const analyze = async () => {
    setBusy(true); setMessage('최신 원고를 저장하고 있습니다.'); setPlan(null);
    const controller = new AbortController(); setAbort(controller);
    try {
      if (!await beforeAnalyze()) throw new Error('원고를 저장하지 못했습니다.');
      const response = await fetch(endpoint, { method: 'POST', headers: { Accept: 'text/event-stream' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]) });
      const result = await readLongTask<ChapterCloseoutPlan>(response, setMessage);
      setPlan(result); setStateIds(result.states.filter(value => !value.warning).map(value => value.id));
      setNodeIds(result.plotNodes.map(value => value.id)); setUseDate(Boolean(result.storyDate));
      setMessage(result.truncated ? '긴 회차의 앞뒤 부분을 중심으로 분석했습니다. 누락 여부를 확인해주세요.' : '후보를 확인하고 반영할 항목만 선택하세요.');
    } catch (error) { setMessage(controller.signal.aborted ? '회차 마감을 중단했습니다.' : error instanceof Error ? error.message : '회차를 분석하지 못했습니다.'); }
    finally { setAbort(null); setBusy(false); }
  };

  const updateState = (id: string, patch: Partial<ChapterCloseoutPlan['states'][number]>) => setPlan(current => current ? {
    ...current, states: current.states.map(value => value.id === id ? { ...value, ...patch } : value),
  } : current);
  const updateNode = (id: string, patch: Partial<ChapterCloseoutPlan['plotNodes'][number]>) => setPlan(current => current ? {
    ...current, plotNodes: current.plotNodes.map(value => value.id === id ? { ...value, ...patch } : value),
  } : current);
  const toggle = (values: string[], id: string, setter: (value: string[]) => void) => setter(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);

  const apply = async () => {
    if (!plan || (!useDate && !stateIds.length && !nodeIds.length)) { setMessage('반영할 후보를 하나 이상 선택해주세요.'); return; }
    setBusy(true); setMessage('승인한 변경을 반영하고 있습니다.');
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        snapshotHash: plan.snapshotHash, storyDate: useDate ? plan.storyDate : null,
        states: plan.states.filter(value => stateIds.includes(value.id)), plotNodes: plan.plotNodes.filter(value => nodeIds.includes(value.id)),
      }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '마감 결과를 반영하지 못했습니다.');
      if (result.chapter) onApplied(result.chapter); setPlan(null); setMessage('이번 화의 상태와 사건 흐름을 반영했습니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '마감 결과를 반영하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const field = 'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring';
  return <aside aria-label="이번 화 마감" className="border-b border-primary/20 bg-[color-mix(in_oklab,var(--card)_92%,var(--primary)_8%)] px-5 py-4 sm:px-7">
    <div className="flex items-start justify-between gap-3"><div><p className="muse-eyebrow flex items-center gap-1.5"><ClipboardCheck className="size-3.5" />Chapter closeout</p><h3 className="mt-1 font-heading text-base font-semibold">이번 화 마감</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">원고에서 지속 상태, 인물의 지식, 독자 공개 정보와 주요 사건·복선을 추출합니다.</p></div><Button aria-label="이번 화 마감 닫기" onClick={onClose} size="icon-sm" variant="ghost"><X /></Button></div>
    <div className="mt-3 flex items-center gap-3"><Button disabled={busy} onClick={() => void analyze()}>{busy ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}{plan ? '다시 분석' : '원고 분석'}</Button>{busy && <Button onClick={() => abort?.abort()} variant="outline">중단</Button>}<span className="text-xs text-muted-foreground" role="status">{message}</span></div>
    {plan && <div className="mt-4 max-h-[38rem] space-y-4 overflow-y-auto pr-1"><p className="rounded-xl border border-border bg-background/60 p-3 text-sm leading-6">{plan.summary}</p>
      {plan.storyDate && <section className="rounded-xl border border-border bg-card p-3"><label className="flex items-start gap-3"><input checked={useDate} className="mt-1" onChange={event => setUseDate(event.target.checked)} type="checkbox" /><span><strong className="text-sm">작품 시간 반영</strong><span className="mt-1 block text-xs text-muted-foreground">{plan.storyDate.storyDateLabel || [plan.storyDate.storyYear && `${plan.storyDate.storyYear}년`, plan.storyDate.storyMonth && `${plan.storyDate.storyMonth}월`, plan.storyDate.storyDay && `${plan.storyDate.storyDay}일`, plan.storyDate.storyTimeLabel].filter(Boolean).join(' ')}</span><span className="mt-1 block text-xs">“{plan.storyDate.evidence}”</span></span></label></section>}
      {!!plan.states.length && <section><h4 className="mb-2 text-sm font-semibold">상태·지식 변화 {plan.states.length}개</h4><div className="grid gap-2 lg:grid-cols-2">{plan.states.map(candidate => <article className={`rounded-xl border p-3 ${candidate.warning ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card'}`} key={candidate.id}><label className="flex items-start gap-2"><input checked={stateIds.includes(candidate.id)} className="mt-1" disabled={Boolean(candidate.warning)} onChange={() => toggle(stateIds, candidate.id, setStateIds)} type="checkbox" /><span className="min-w-0 flex-1"><span className="text-xs text-muted-foreground">{candidate.category} · {candidate.subjectName || '작품 전체'} · {candidate.knowledgeScope === 'canon' ? '실제 사실' : candidate.knowledgeScope === 'reader' ? '독자 공개' : `${candidate.knowerName ?? '인물'}의 정보`}</span></span></label><div className="mt-2 grid gap-2"><Input aria-label="상태 항목 이름" value={candidate.label} onChange={event => updateState(candidate.id, { label: event.target.value })} /><div className="grid grid-cols-2 gap-2"><Input aria-label="이전 상태" placeholder="이전 값" value={candidate.previousValue ?? ''} onChange={event => updateState(candidate.id, { previousValue: event.target.value || null })} /><Input aria-label="변경 상태" value={candidate.value} onChange={event => updateState(candidate.id, { value: event.target.value })} /></div></div><p className="mt-2 text-xs leading-5">“{candidate.evidence}”</p>{candidate.warning && <p className="mt-1 text-xs text-amber-600">{candidate.warning}</p>}</article>)}</div></section>}
      {!!plan.plotNodes.length && <section><h4 className="mb-2 text-sm font-semibold">사건·복선 {plan.plotNodes.length}개</h4><div className="grid gap-2 lg:grid-cols-2">{plan.plotNodes.map(candidate => <article className="rounded-xl border border-border bg-card p-3" key={candidate.id}><label className="flex items-start gap-2"><input checked={nodeIds.includes(candidate.id)} className="mt-1" onChange={() => toggle(nodeIds, candidate.id, setNodeIds)} type="checkbox" /><span className="text-xs font-semibold text-primary">{PLOT_NODE_LABELS[candidate.nodeKind]}</span></label><div className="mt-2 space-y-2"><Input aria-label="사건 제목" value={candidate.title} onChange={event => updateNode(candidate.id, { title: event.target.value })} /><textarea aria-label="사건 설명" className={`${field} min-h-20 py-2`} value={candidate.description ?? ''} onChange={event => updateNode(candidate.id, { description: event.target.value || null })} /></div><p className="mt-2 text-xs leading-5">“{candidate.evidence}”</p></article>)}</div></section>}
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card/95 py-3"><Button disabled={busy} onClick={() => void apply()}>{busy ? <Loader2 className="animate-spin" /> : <Check />}선택 항목 승인·반영</Button></div>
    </div>}
  </aside>;
}
