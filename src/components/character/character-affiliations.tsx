'use client';

import { History, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Membership = { id?: string; organizationEntryId: string | null; organizationTitle: string; position: string | null; isPrimary: number };
type Event = { id: string; chapterId: string | null; chapterTitle: string | null; boundary: 'initial' | 'chapter_start' | 'chapter_end' | 'unplaced'; reason: string | null; memberships: Membership[] };
type State = { revision: number; current: Event | null; upcoming: Event | null; events: Event[];
  organizationOptions: Array<{ id: string; title: string; category: string }>;
  chapters: Array<{ id: string; title: string; order: number }>;
};
type DraftMembership = { organizationEntryId: string; position: string; isPrimary: boolean };
const emptyMembership = (): DraftMembership => ({ organizationEntryId: '', position: '', isPrimary: true });
const boundaryLabel = (event: Event) => event.boundary === 'initial' ? '초기 설정' : event.boundary === 'unplaced' ? `회차 연결 끊김 · ${event.chapterTitle ?? '삭제된 회차'}` : `${event.chapterTitle} ${event.boundary === 'chapter_end' ? '종료 후' : '시작부터'}`;

export function CharacterAffiliations({ projectId, characterId }: { projectId: string; characterId: string }) {
  const [data, setData] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [boundary, setBoundary] = useState<'initial' | 'chapter_start' | 'chapter_end'>('initial');
  const [reason, setReason] = useState('');
  const [memberships, setMemberships] = useState<DraftMembership[]>([emptyMembership()]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const endpoint = `/api/projects/${projectId}/characters/${characterId}/affiliations`;
  const load = async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal }); const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? '소속 정보를 불러오지 못했습니다.'); setData(result);
  };
  useEffect(() => { const controller = new AbortController(); void load(controller.signal).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); }); return () => controller.abort(); }, [endpoint]);
  const reset = () => { setChapterId(''); setBoundary('initial'); setReason(''); setMemberships([emptyMembership()]); setEditingEventId(null); setOpen(false); };
  const startEdit = (event: Event) => {
    setEditingEventId(event.id); setChapterId(event.chapterId ?? '');
    setBoundary(event.boundary === 'initial' ? 'initial' : event.boundary === 'chapter_end' ? 'chapter_end' : 'chapter_start');
    setReason(event.reason ?? ''); setMemberships(event.memberships.length ? event.memberships.map((membership) => ({
      organizationEntryId: membership.organizationEntryId ?? '', position: membership.position ?? '', isPrimary: Boolean(membership.isPrimary),
    })) : [emptyMembership()]); setOpen(true); setError(''); setMessage('');
  };
  const save = async () => {
    if (!data || busy) return;
    const selectedRows = memberships.filter((membership) => membership.organizationEntryId);
    const primaryIndex = selectedRows.findIndex((membership) => membership.isPrimary);
    const selected = selectedRows.map((membership, index) => ({ ...membership, isPrimary: index === (primaryIndex >= 0 ? primaryIndex : 0) }));
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(editingEventId ? `${endpoint}/${editingEventId}` : endpoint, { method: editingEventId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        expectedRevision: data.revision, chapterId: boundary === 'initial' ? null : chapterId || null, boundary,
        reason: reason.trim() || null, memberships: selected.map((membership) => ({ ...membership, position: membership.position.trim() || null })),
      }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '소속 변화를 저장하지 못했습니다.');
      setData(result); setMessage(editingEventId ? '소속 기록을 정정했습니다.' : '소속·직위 변화를 기록했습니다.'); reset();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '소속 변화를 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const remove = async (eventId: string) => {
    if (!data || busy || !confirm('이 소속 기록을 삭제할까요? 다른 회차 기록은 유지됩니다.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${endpoint}/${eventId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: data.revision }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '소속 기록을 삭제하지 못했습니다.'); setData(result); setMessage('소속 기록을 삭제했습니다.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '소속 기록을 삭제하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const current = data?.current?.memberships ?? [];
  const primary = current.find((membership) => membership.isPrimary) ?? current[0];
  return <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
    <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold">소속 · 직위</h3><p className="mt-1 text-xs text-muted-foreground">최종 등록 회차 기준 · 회차별 변화 이력</p></div><Button disabled={busy} onClick={() => setOpen((value) => !value)} size="sm" type="button" variant="outline">{open ? '닫기' : '변화 기록'}</Button></div>
    <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">소속</p><p className="mt-1 font-medium">{primary?.organizationTitle ?? (data ? '미설정' : '불러오는 중...')}</p></div><div className="rounded-lg bg-background p-3"><p className="text-xs text-muted-foreground">직위</p><p className="mt-1 font-medium">{primary?.position || (primary ? '미지정' : '—')}</p></div></div>
    {current.length > 1 && <p className="text-xs text-muted-foreground">겸직: {current.filter((membership) => membership !== primary).map((membership) => `${membership.organizationTitle}${membership.position ? ` · ${membership.position}` : ''}`).join(', ')}</p>}
    {open && data && <div className="space-y-3 border-t border-border pt-3">
      <div className="grid gap-2 sm:grid-cols-2"><label className="space-y-1 text-xs">적용 회차<select className="w-full rounded-lg border border-input bg-background p-2 text-sm" disabled={busy || boundary === 'initial'} onChange={(event) => setChapterId(event.target.value)} value={chapterId}><option value="">회차 선택</option>{data.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.order + 1}화 · {chapter.title}</option>)}</select></label><label className="space-y-1 text-xs">적용 시점<select className="w-full rounded-lg border border-input bg-background p-2 text-sm" disabled={busy} onChange={(event) => { const value = event.target.value as typeof boundary; setBoundary(value); if (value === 'initial') setChapterId(''); }} value={boundary}><option value="initial">초기 설정</option><option value="chapter_start">회차 시작부터</option><option value="chapter_end">회차 종료 후</option></select></label></div>
      <div className="space-y-2">{memberships.map((membership, index) => <div className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={index}><label className="space-y-1 text-xs">소속<select className="w-full rounded border border-input bg-background p-2 text-sm" disabled={busy} onChange={(event) => setMemberships((currentMemberships) => currentMemberships.map((item, itemIndex) => itemIndex === index ? { ...item, organizationEntryId: event.target.value } : item))} value={membership.organizationEntryId}><option value="">무소속/미설정</option>{data.organizationOptions.map((option) => <option key={option.id} value={option.id}>{option.title} · {option.category}</option>)}</select></label><label className="space-y-1 text-xs">직위<Input disabled={busy} maxLength={120} onChange={(event) => setMemberships((currentMemberships) => currentMemberships.map((item, itemIndex) => itemIndex === index ? { ...item, position: event.target.value } : item))} placeholder="예: 명예장로" value={membership.position} /></label><div className="flex items-end gap-1"><label className="flex h-10 items-center gap-1 text-xs"><input checked={membership.isPrimary} disabled={busy} name="primary-affiliation" onChange={() => setMemberships((currentMemberships) => currentMemberships.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })))} type="radio" />대표</label>{memberships.length > 1 && <Button aria-label="소속 행 삭제" disabled={busy} onClick={() => setMemberships((currentMemberships) => { const remaining = currentMemberships.filter((_, itemIndex) => itemIndex !== index); const selectedPrimary = Math.max(0, remaining.findIndex((item) => item.isPrimary)); return remaining.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === selectedPrimary })); })} size="icon" type="button" variant="ghost"><Trash2 /></Button>}</div></div>)}</div>
      <Button disabled={busy || memberships.length >= 20} onClick={() => setMemberships((currentMemberships) => [...currentMemberships, { ...emptyMembership(), isPrimary: false }])} size="sm" type="button" variant="outline"><Plus />다른 소속 추가</Button>
      <label className="block space-y-1 text-xs">변경 사유<Input disabled={busy} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="예: 장로회의 승인" value={reason} /></label>
      {data.organizationOptions.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">세계관에서 단체 특성을 가진 카테고리를 지정해야 소속을 선택할 수 있습니다.</p>}
      <Button disabled={busy || (boundary !== 'initial' && !chapterId)} onClick={() => void save()} type="button">{busy ? '저장 중...' : editingEventId ? '소속 기록 정정' : '소속 변화 저장'}</Button>
    </div>}
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}{message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    {data && data.events.length > 0 && <details><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><History className="size-4" />소속 이력 {data.events.length}개</summary><div className="mt-2 space-y-2">{[...data.events].reverse().map((event) => <div className="flex items-start justify-between gap-2 rounded-lg border border-border p-2 text-xs" key={event.id}><div><p className="font-medium">{boundaryLabel(event)}</p><p className="mt-1 text-muted-foreground">{event.memberships.length ? event.memberships.map((membership) => `${membership.organizationTitle}${membership.position ? ` / ${membership.position}` : ''}`).join(', ') : '무소속'}{event.reason ? ` · ${event.reason}` : ''}</p></div><div className="flex gap-1"><Button disabled={busy} onClick={() => startEdit(event)} size="sm" type="button" variant="outline">정정</Button><Button aria-label="소속 기록 삭제" disabled={busy} onClick={() => void remove(event.id)} size="icon" type="button" variant="ghost"><Trash2 /></Button></div></div>)}</div></details>}
  </section>;
}
