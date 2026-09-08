'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EMPTY_SCENE, SCENE_LABELS, type ScenePlan, type SceneRecord, type WritingExample } from '@/lib/writing-workbench';
import { readLongTask } from '@/lib/client/long-task';

type Props = { projectId: string; chapterId: string; sceneId: string | null; onSceneChange: (id: string | null) => void; getContent: () => Promise<string>; getSelection: () => string; examplesOnly?: boolean; proposal?: { sceneId: string; revision: number; plan: ScenePlan; reason: string } | null };
const textClass = 'w-full rounded-lg border border-border bg-background p-2 text-sm leading-6 outline-none';

export function SceneWorkbench({ projectId, chapterId, sceneId, onSceneChange, getContent, getSelection, examplesOnly = false, proposal }: Props) {
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [examples, setExamples] = useState<WritingExample[]>([]);
  const [title, setTitle] = useState('새 장면');
  const [plan, setPlan] = useState<ScenePlan>({ ...EMPTY_SCENE });
  const [revision, setRevision] = useState<number | undefined>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [sampleTitle, setSampleTitle] = useState('문체 견본');
  const [sample, setSample] = useState('');
  const [dirty, setDirty] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const base = `/api/projects/${projectId}/writing-workbench`;
  async function load(signal?: AbortSignal) {
    const response = await fetch(`${base}?chapterId=${chapterId}`, { signal });
    if (!response.ok) throw new Error('장면 설계와 사례를 불러오지 못했습니다.');
    const data = await response.json() as { scenes: SceneRecord[]; examples: WritingExample[] };
    setScenes(data.scenes); setExamples(data.examples);
    return data;
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(data => {
      const selected = data.scenes.find(scene => scene.id === sceneId);
      if (selected) { setTitle(selected.title); setPlan(JSON.parse(selected.planJson)); setRevision(selected.revision);
        if (proposal && proposal.sceneId === selected.id) {
          if (proposal.revision === selected.revision) { setPlan(proposal.plan); setDirty(true); setStatus(`미확정 변경 후보: ${proposal.reason}`); }
          else setStatus('설계가 이미 변경되어 오래된 변경 후보를 적용하지 않았습니다.');
        }
      }
    }).catch(error => { if (!controller.signal.aborted) setStatus(String(error.message)); });
    return () => { controller.abort(); abortRef.current?.abort(); };
  }, [projectId, chapterId, proposal]);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);
  const post = async (body: unknown) => {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '저장하지 못했습니다.');
    return data;
  };
  const action = async (task: () => Promise<void>) => {
    setBusy(true); setStatus('처리 중...');
    try { await task(); } catch (error) { setStatus(error instanceof Error ? error.message : '실패했습니다.'); }
    finally { setBusy(false); }
  };
  const save = (state: 'draft' | 'confirmed') => action(async () => {
    const scene = await post({ action: 'save-scene', chapterId, id: sceneId ?? undefined, revision, title, status: state, plan }) as SceneRecord;
    setRevision(scene.revision); onSceneChange(scene.id); setDirty(false);
    window.dispatchEvent(new Event('muse-writing-context-changed'));
    await load(); setStatus(state === 'confirmed' ? '확정한 장면을 집필·비평·Ghost Text에서 참고합니다.' : '초안을 저장했습니다. 확정 전에는 AI 집필 기준에 포함되지 않습니다.');
  });
  const draft = () => action(async () => {
    abortRef.current = new AbortController();
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ action: 'draft-scene', chapterId, sceneId, currentContentJson: await getContent() }), signal: abortRef.current.signal });
    const result = await readLongTask<{ plan: ScenePlan }>(response, setStatus);
    setPlan(result.plan); setDirty(true); setStatus('AI 장면 초안입니다. 내용을 수정한 뒤 저장하거나 확정해주세요.');
  });
  return <section className="space-y-4 border-b border-border bg-card/50 p-5">
    {!examplesOnly && <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">장면 설계</h3>
        <select aria-label="집필할 장면" className={`${textClass} max-w-64`} value={sceneId ?? ''} disabled={busy}
          onChange={event => {
            if (dirty && !window.confirm('저장하지 않은 장면 편집을 닫을까요?')) return;
            const scene = scenes.find(item => item.id === event.target.value);
            onSceneChange(scene?.id ?? null); setTitle(scene?.title ?? '새 장면'); setPlan(scene ? JSON.parse(scene.planJson) : { ...EMPTY_SCENE }); setRevision(scene?.revision); setDirty(false);
          }}>
          <option value="">장면 추가 / 선택 안 함</option>
          {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.title} · {scene.status === 'confirmed' ? '확정' : '초안'}</option>)}
        </select>
        <Button disabled={busy} onClick={draft} size="sm" variant="outline">원고에서 장면 초안 만들기</Button>
        {busy && <Button onClick={() => abortRef.current?.abort()} size="sm" variant="outline">중단</Button>}
      </div>
      <Input aria-label="장면 제목" value={title} onChange={e => { setTitle(e.target.value); setDirty(true); }} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(SCENE_LABELS) as (keyof ScenePlan)[]).map(key => <label key={key} className="space-y-1 text-xs text-muted-foreground">
        <span>{SCENE_LABELS[key]}</span><textarea className={textClass} rows={key === 'beats' ? 4 : 2} value={plan[key]}
          onChange={e => { setPlan(current => ({ ...current, [key]: e.target.value })); setDirty(true); }} />
      </label>)}</div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !title.trim()} onClick={() => save('draft')} variant="outline">초안 저장</Button>
        <Button disabled={busy || !title.trim()} onClick={() => save('confirmed')}>설계 확정</Button>
        {sceneId && <Button disabled={busy} variant="ghost" onClick={() => {
          if (!window.confirm('이 장면 설계를 삭제할까요? 원고는 유지됩니다.')) return;
          void action(async () => { await post({ action: 'delete-scene', chapterId, id: sceneId, revision }); onSceneChange(null); setPlan({ ...EMPTY_SCENE }); setTitle('새 장면'); setRevision(undefined); setDirty(false); await load(); setStatus('장면 설계를 삭제했습니다.'); });
        }}>설계 삭제</Button>}
        {dirty && <span className="self-center text-xs text-muted-foreground">저장하지 않은 변경</span>}
      </div>
    </>}
    <details open={examplesOnly} className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer font-medium">문체·편집 사례 {examples.length}개</summary>
      <p className="my-2 text-xs text-muted-foreground">직접 선택한 견본과 승인·거절 사례를 다음 요청에서 참고합니다. 저장은 모델 학습을 실행하지 않습니다.</p>
      <Input aria-label="견본 제목" value={sampleTitle} onChange={e => setSampleTitle(e.target.value)} />
      <textarea aria-label="문체 견본" className={`${textClass} mt-2`} rows={5} maxLength={6000} value={sample} onChange={e => setSample(e.target.value)} placeholder="마음에 드는 실제 문단을 붙여넣거나 원고에서 선택한 구절을 가져오세요." />
      <div className="my-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => { const text = getSelection(); if (text) setSample(text.slice(0, 6000)); else setStatus('원고에서 견본으로 쓸 구절을 먼저 선택해주세요.'); }}>선택한 구절 가져오기</Button>
        <Button size="sm" disabled={busy || !sample.trim() || !sampleTitle.trim()} onClick={() => action(async () => {
          await post({ action: 'save-example', example: { kind: 'style', verdict: 'accepted', title: sampleTitle, replacement: sample, reason: '작가가 선택한 문체 견본' } });
          await load(); setStatus('견본을 저장했습니다.'); setSample('');
        })}>견본 저장</Button>
        <a href={`${base}?format=jsonl`} className="self-center text-xs underline">학습 검토용 JSONL 내보내기</a>
      </div>
      <div className="max-h-64 space-y-2 overflow-auto">{examples.map(example => <details key={example.id} className="rounded border border-border p-2 text-sm">
        <summary className="cursor-pointer">{example.title} · {example.kind === 'style' ? '문체' : example.verdict === 'accepted' ? '승인 사례' : '거절 사례'}</summary>
        {example.original && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">원문: {example.original}</p>}
        <p className="my-2 whitespace-pre-wrap">{example.replacement}</p><p className="text-xs text-muted-foreground">{example.reason}</p>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => action(async () => { await post({ action: 'delete-example', id: example.id }); await load(); setStatus('사례를 삭제했습니다.'); })}>사례 삭제</Button>
      </details>)}</div>
    </details>
    {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
  </section>;
}
