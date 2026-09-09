'use client';

import { ArrowDown, Check, Link2, Loader2, Pencil, Plus, Search, Trash2, Waypoints, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PLOT_EDGE_LABELS, PLOT_EDGE_TYPES, PLOT_NODE_KINDS, PLOT_NODE_LABELS, type PlotBoardEdge, type PlotBoardNode } from '@/lib/plot-board';
import { formatStoryDate, storyDateOrder, type StoryCalendar } from '@/lib/story-timeline';

type Chapter = { id: string; order: number; title: string };
type NodeForm = { title: string; description: string; kind: (typeof PLOT_NODE_KINDS)[number]; status: 'draft' | 'confirmed'; chapterId: string; lane: string; evidence: string };
const EMPTY_NODE: NodeForm = { title: '', description: '', kind: 'event', status: 'draft', chapterId: '', lane: '', evidence: '' };

export function PlotBoard({ projectId }: { projectId: string }) {
  const [nodes, setNodes] = useState<PlotBoardNode[]>([]);
  const [edges, setEdges] = useState<PlotBoardEdge[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [calendar, setCalendar] = useState<StoryCalendar>({ era: '작품력', monthsPerYear: 12, daysPerMonth: 30, timeLabels: [] });
  const [form, setForm] = useState<NodeForm>(EMPTY_NODE);
  const [editingId, setEditingId] = useState('');
  const [edgeForm, setEdgeForm] = useState({ fromNodeId: '', toNodeId: '', type: 'causes' as (typeof PLOT_EDGE_TYPES)[number] });
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const base = `/api/projects/${projectId}/plot-board`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [boardResponse, chapterResponse] = await Promise.all([
        fetch(base, { cache: 'no-store' }), fetch(`/api/projects/${projectId}/chapters`, { cache: 'no-store' }),
      ]);
      const board = await boardResponse.json(); const chapterRows = await chapterResponse.json();
      if (!boardResponse.ok || !chapterResponse.ok) throw new Error(board.error || chapterRows.error || '보드를 불러오지 못했습니다.');
      setNodes(board.nodes); setEdges(board.edges); setCalendar(board.calendar); setChapters(chapterRows);
    } catch (error) { setMessage(error instanceof Error ? error.message : '보드를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, [base, projectId]);
  useEffect(() => { void load(); }, [load]);

  const visibleNodes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko-KR');
    return nodes.filter(node => (!kindFilter || node.kind === kindFilter) && (!statusFilter || node.status === statusFilter) &&
      (!needle || `${node.title} ${node.description ?? ''} ${node.lane ?? ''} ${node.chapterTitle ?? ''}`.toLocaleLowerCase('ko-KR').includes(needle)))
      .sort((left, right) => (storyDateOrder(left, calendar) ?? Number.MAX_SAFE_INTEGER) - (storyDateOrder(right, calendar) ?? Number.MAX_SAFE_INTEGER)
        || (left.chapterOrder ?? Number.MAX_SAFE_INTEGER) - (right.chapterOrder ?? Number.MAX_SAFE_INTEGER) || left.sortOrder - right.sortOrder);
  }, [calendar, kindFilter, nodes, query, statusFilter]);
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const reset = () => { setEditingId(''); setForm(EMPTY_NODE); };
  const edit = (node: PlotBoardNode) => { setEditingId(node.id); setForm({ title: node.title, description: node.description ?? '', kind: node.kind, status: node.status, chapterId: node.chapterId ?? '', lane: node.lane ?? '', evidence: node.evidence ?? '' }); };

  const saveNode = async () => {
    if (!form.title.trim()) return;
    setBusy(true); setMessage('');
    const data = { ...form, title: form.title.trim(), description: form.description.trim() || null, chapterId: form.chapterId || null,
      lane: form.lane.trim() || null, evidence: form.evidence.trim() || null, storyYear: null, storyMonth: null, storyDay: null,
      storyTimeLabel: null, storyDatePrecision: 'none', storyDateLabel: null, sortOrder: editingId ? nodeById.get(editingId)?.sortOrder ?? 0 : nodes.length };
    try {
      const response = await fetch(base, { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { resource: 'node', id: editingId, data } : { resource: 'node', data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || '노드를 저장하지 못했습니다.');
      reset(); await load(); setMessage(editingId ? '노드를 수정했습니다.' : '노드를 추가했습니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '노드를 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const remove = async (resource: 'node' | 'edge', id: string) => {
    if (!window.confirm(resource === 'node' ? '이 노드와 연결을 삭제할까요?' : '이 연결을 삭제할까요?')) return;
    setBusy(true);
    try { const response = await fetch(`${base}?resource=${resource}&id=${id}`, { method: 'DELETE' }); if (!response.ok) throw new Error('삭제하지 못했습니다.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '삭제하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const saveEdge = async () => {
    if (!edgeForm.fromNodeId || !edgeForm.toNodeId) return;
    setBusy(true); setMessage('');
    try { const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'edge', data: edgeForm }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || '연결하지 못했습니다.'); setEdgeForm(current => ({ ...current, toNodeId: '' })); await load(); setMessage('인과 연결을 추가했습니다.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '연결하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const field = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring';
  return <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
    <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
      <section className="muse-panel space-y-3 p-4"><div className="flex items-center justify-between"><div><p className="muse-eyebrow">Causality</p><h2 className="mt-1 font-heading text-lg font-semibold">{editingId ? '노드 수정' : '흐름 추가'}</h2></div>{editingId && <Button aria-label="수정 취소" onClick={reset} size="icon-sm" variant="ghost"><X /></Button>}</div>
        <select aria-label="노드 종류" className={field} value={form.kind} onChange={event => setForm(current => ({ ...current, kind: event.target.value as NodeForm['kind'] }))}>{PLOT_NODE_KINDS.map(kind => <option key={kind} value={kind}>{PLOT_NODE_LABELS[kind]}</option>)}</select>
        <Input aria-label="노드 제목" maxLength={160} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="사건 또는 복선 제목" value={form.title} />
        <select aria-label="연결 회차" className={field} value={form.chapterId} onChange={event => setForm(current => ({ ...current, chapterId: event.target.value }))}><option value="">회차 미정</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select>
        <Input aria-label="흐름 이름" maxLength={100} onChange={event => setForm(current => ({ ...current, lane: event.target.value }))} placeholder="예: 주인공 / 소림 / 공청석유" value={form.lane} />
        <textarea aria-label="노드 설명" className={`${field} min-h-24 py-2`} maxLength={4000} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="무엇이 일어나며 무엇이 달라지는가" value={form.description} />
        <textarea aria-label="원고 근거" className={`${field} min-h-20 py-2`} maxLength={2000} onChange={event => setForm(current => ({ ...current, evidence: event.target.value }))} placeholder="원고 근거 (선택)" value={form.evidence} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input checked={form.status === 'confirmed'} onChange={event => setForm(current => ({ ...current, status: event.target.checked ? 'confirmed' : 'draft' }))} type="checkbox" />확정된 흐름으로 사용</label>
        <Button className="w-full" disabled={busy || !form.title.trim()} onClick={() => void saveNode()}>{busy ? <Loader2 className="animate-spin" /> : editingId ? <Check /> : <Plus />}{editingId ? '수정 저장' : '노드 추가'}</Button>
      </section>
      <section className="muse-panel space-y-3 p-4"><div className="flex items-center gap-2"><Link2 className="size-4 text-primary" /><h2 className="font-semibold">인과 연결</h2></div>
        <select aria-label="원인 노드" className={field} value={edgeForm.fromNodeId} onChange={event => setEdgeForm(current => ({ ...current, fromNodeId: event.target.value }))}><option value="">앞 노드 선택</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select>
        <select aria-label="연결 의미" className={field} value={edgeForm.type} onChange={event => setEdgeForm(current => ({ ...current, type: event.target.value as typeof edgeForm.type }))}>{PLOT_EDGE_TYPES.map(type => <option key={type} value={type}>{PLOT_EDGE_LABELS[type]}</option>)}</select>
        <select aria-label="결과 노드" className={field} value={edgeForm.toNodeId} onChange={event => setEdgeForm(current => ({ ...current, toNodeId: event.target.value }))}><option value="">뒤 노드 선택</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select>
        <Button className="w-full" disabled={busy || !edgeForm.fromNodeId || !edgeForm.toNodeId} onClick={() => void saveEdge()} variant="outline"><Link2 />연결 추가</Button>
      </section>
    </aside>
    <main className="muse-panel min-w-0 p-5 sm:p-7"><div className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="muse-eyebrow flex items-center gap-1.5"><Waypoints className="size-3.5" />Story flow</p><h1 className="mt-2 font-heading text-2xl font-semibold">복선·사건 인과 보드</h1><p className="mt-2 text-sm text-muted-foreground">회차와 작품 시간 순서로 사건의 원인, 선택, 결과와 복선 회수를 확인합니다.</p></div><div className="flex flex-wrap gap-2"><label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="보드 검색" className="w-48 pl-9" onChange={event => setQuery(event.target.value)} placeholder="제목·흐름 검색" value={query} /></label><select aria-label="종류 필터" className={field} value={kindFilter} onChange={event => setKindFilter(event.target.value)}><option value="">전체 종류</option>{PLOT_NODE_KINDS.map(kind => <option key={kind} value={kind}>{PLOT_NODE_LABELS[kind]}</option>)}</select><select aria-label="상태 필터" className={field} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">전체 상태</option><option value="confirmed">확정</option><option value="draft">초안</option></select></div></div>
      {message && <p className="mt-4 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">{message}</p>}
      {loading ? <div className="grid min-h-72 place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />보드를 불러오는 중...</span></div> : visibleNodes.length === 0 ? <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border mt-5 text-center text-sm text-muted-foreground">첫 사건이나 복선을 왼쪽에서 추가하세요.</div> : <div className="relative mt-6 space-y-4 before:absolute before:bottom-4 before:left-[1.15rem] before:top-4 before:w-px before:bg-border">
        {visibleNodes.map(node => { const outgoing = edges.filter(edge => edge.fromNodeId === node.id); const incoming = edges.filter(edge => edge.toNodeId === node.id); return <article className="relative ml-10 rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm" key={node.id}><span className="absolute -left-[2.42rem] top-5 grid size-5 place-items-center rounded-full border border-primary/40 bg-background text-primary"><span className="size-2 rounded-full bg-current" /></span><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">{PLOT_NODE_LABELS[node.kind]}</span><span className="text-xs text-muted-foreground">{node.chapterTitle ?? '회차 미정'} · {formatStoryDate(calendar, node)}</span>{node.lane && <span className="rounded-full border border-border px-2 py-0.5 text-[0.68rem]">{node.lane}</span>}{node.status === 'draft' && <span className="text-[0.68rem] text-amber-600">초안</span>}</div><h2 className="mt-2 text-base font-semibold">{node.title}</h2>{node.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{node.description}</p>}</div><div className="flex shrink-0"><Button aria-label={`${node.title} 수정`} onClick={() => edit(node)} size="icon-sm" variant="ghost"><Pencil /></Button><Button aria-label={`${node.title} 삭제`} disabled={busy} onClick={() => void remove('node', node.id)} size="icon-sm" variant="ghost"><Trash2 className="text-destructive" /></Button></div></div>
          {node.evidence && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">원고 근거</summary><p className="mt-1 border-l-2 border-primary/30 pl-2">{node.evidence}</p></details>}
          {(incoming.length > 0 || outgoing.length > 0) && <div className="mt-3 border-t border-border/60 pt-3 text-xs"><div className="flex flex-wrap gap-2">{incoming.map(edge => <span className="rounded-lg bg-muted px-2 py-1" key={edge.id}>{nodeById.get(edge.fromNodeId)?.title ?? '삭제된 노드'} → {PLOT_EDGE_LABELS[edge.type]} <button aria-label="연결 삭제" className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => void remove('edge', edge.id)}>×</button></span>)}</div>{outgoing.map(edge => <div className="mt-2 flex items-center gap-2 text-muted-foreground" key={edge.id}><ArrowDown className="size-3.5" /><span>{PLOT_EDGE_LABELS[edge.type]} → {nodeById.get(edge.toNodeId)?.title ?? '삭제된 노드'}</span></div>)}</div>}
        </article>; })}
      </div>}
    </main>
  </div>;
}
