'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { readLongTask } from '@/lib/client/long-task';
import type { StorylineConversation, StorylineNoteEditPlan } from '@/lib/storyline-chat';

type Props = {
  projectId: string;
  noteId: string;
  beforeSend: () => Promise<boolean>;
  onAppend: (text: string) => Promise<boolean>;
  onApplyEdits: (plan: StorylineNoteEditPlan) => Promise<boolean>;
};
type ChatData = StorylineConversation & { chapters: { id: string; title: string }[] };
const quickQuestions = ['지금 원고 흐름을 토대로 다음 전개를 함께 구상해줘.', '인물의 동기와 사건의 인과가 자연스러운지 살펴봐줘.', '기존 복선을 어떻게 회수하면 좋을까?'];

export function StorylineChatPanel({ projectId, noteId, beforeSend, onAppend, onApplyEdits }: Props) {
  const [conversation, setConversation] = useState<StorylineConversation>({ messages: [], revision: 0 });
  const [chapters, setChapters] = useState<ChatData['chapters']>([]);
  const [chapterId, setChapterId] = useState('');
  const [input, setInput] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [appending, setAppending] = useState(false);
  const [appendingMessageId, setAppendingMessageId] = useState('');
  const [appendingKind, setAppendingKind] = useState<'summary' | 'edit'>('summary');
  const [editPlan, setEditPlan] = useState<(StorylineNoteEditPlan & { messageId: string }) | null>(null);
  const [applyingEdit, setApplyingEdit] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);
  const mounted = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const base = `/api/projects/${projectId}/author-notes/${noteId}/chat`;

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(base, { signal, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '대화를 불러오지 못했습니다.');
    if (signal?.aborted || !mounted.current) return;
    setConversation(data); setChapters(data.chapters); setReady(true);
  }, [base]);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal).catch(error => { if (!controller.signal.aborted) setStatus(error.message); });
    return () => { mounted.current = false; controller.abort(); abortRef.current?.abort(); };
  }, [load]);
  useEffect(() => {
    if (nearBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation, draft, pendingQuestion, status]);

  async function send() {
    const question = input.trim();
    if (!question || activeRef.current || !ready) return;
    activeRef.current = true; setBusy(true); setDraft(''); setPendingQuestion(question); setInput(''); nearBottom.current = true;
    const controller = new AbortController(); abortRef.current = controller;
    let buffered = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      setStatus('스토리라인의 최신 변경을 저장하고 있습니다.');
      if (!await beforeSend()) throw new Error('노트를 먼저 저장해주세요.');
      controller.signal.throwIfAborted();
      const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: question, revision: conversation.revision, chapterId: chapterId || null }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]) });
      const result = await readLongTask<StorylineConversation>(response, message => { if (mounted.current) setStatus(message); }, text => {
        buffered += text;
        if (!timer) timer = setTimeout(() => { if (mounted.current) setDraft(buffered); timer = undefined; }, 60);
      });
      if (!mounted.current) return;
      setConversation(result); setPendingQuestion(''); setDraft('');
      setStatus('대화를 저장했습니다. 필요한 답변은 핵심만 정리해 노트에 추가할 수 있습니다.');
    } catch (error) {
      if (!mounted.current) return;
      setDraft(buffered); setInput(question);
      setStatus(controller.signal.aborted ? '응답을 중단했습니다. 이번 미완료 답변은 저장하지 않았습니다.' : `${error instanceof Error ? error.message : '응답에 실패했습니다.'} 대화 새로고침 후 다시 시도할 수 있습니다.`);
    } finally {
      clearTimeout(timer); activeRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function refresh() {
    if (activeRef.current) return;
    setReady(false);
    try { await load(); setDraft(''); setPendingQuestion(''); setStatus('대화를 다시 불러왔습니다.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : '불러오지 못했습니다.'); }
  }
  async function clear() {
    if (activeRef.current || !window.confirm('이 노트의 AI 대화만 지울까요? 노트와 원고는 유지됩니다.')) return;
    activeRef.current = true; setBusy(true);
    try {
      const response = await fetch(base, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: conversation.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '대화를 지우지 못했습니다.');
      if (mounted.current) { setConversation(data); setDraft(''); setPendingQuestion(''); setStatus('대화를 비웠습니다.'); }
    } catch (error) { if (mounted.current) setStatus(error instanceof Error ? error.message : '요청 실패'); }
    finally { activeRef.current = false; if (mounted.current) setBusy(false); }
  }
  return <aside aria-label="스토리라인 AI 대화" className="flex min-w-0 flex-col border-t border-border bg-card/50 xl:sticky xl:top-24 xl:h-[calc(100dvh-8rem)] xl:border-t-0 xl:border-l">
    <div className="space-y-3 border-b border-border p-4">
      <h3 className="font-semibold">스토리라인 AI</h3>
      <p className="text-xs leading-5 text-muted-foreground">저장된 원고·세계관·현재 노트를 참고해 함께 구상합니다. 원고를 자동 수정하지 않습니다.</p>
      <label className="block text-xs">집중 참조할 회차
        <select aria-label="집중 참조할 회차" className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-foreground" value={chapterId} disabled={busy}
          onChange={event => setChapterId(event.target.value)}>
          <option value="">전체 원고에서 관련 부분 찾기</option>
          {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={busy || appending || applyingEdit} onClick={() => void refresh()}>대화 새로고침</Button>
        <Button size="sm" variant="ghost" disabled={busy || appending || applyingEdit || !ready || !conversation.messages.length} onClick={() => void clear()}>대화 비우기</Button>
      </div>
    </div>
    <div ref={scrollRef} className="max-h-[60dvh] min-h-48 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 xl:max-h-none"
      onScroll={() => { const el = scrollRef.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {!conversation.messages.length && !pendingQuestion && <div className="space-y-2">
        {quickQuestions.map(question => <button key={question} type="button" className="block w-full rounded-xl border border-border p-3 text-left text-sm hover:bg-accent" disabled={busy} onClick={() => setInput(question)}>{question}</button>)}
      </div>}
      {conversation.messages.map(message => <article key={message.id} className={`min-w-0 rounded-xl p-3 ${message.role === 'user' ? 'bg-primary/10' : 'border border-border bg-background/50'}`}>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{message.role === 'user' ? '작가' : 'AI 구상 파트너'}</p>
        <div className="space-y-2 break-words text-sm leading-7 [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ul]:list-disc [&_ol]:list-decimal [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt}</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{children}</a>, table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div> }}>{message.text}</ReactMarkdown>
        </div>
        {message.incomplete && <p className="mt-2 text-xs text-amber-600">출력 길이 제한으로 답변이 끝났습니다. 이어서 설명해 달라고 요청할 수 있습니다.</p>}
        {message.references && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">참고한 원고 범위</summary><ul className="mt-2 space-y-1">{message.references.map((reference, index) => <li key={`${index}:${reference}`}>{reference}</li>)}</ul></details>}
        {message.role === 'assistant' && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || appending || applyingEdit || added.includes(message.id)} onClick={async () => {
          setAppending(true); setAppendingMessageId(message.id); setAppendingKind('summary');
          try {
            setStatus('답변에서 핵심 내용만 추려 기존 노트와 비교하고 있습니다.');
            if (!await beforeSend()) throw new Error('노트를 먼저 저장해주세요.');
            const controller = new AbortController(); abortRef.current = controller;
            const response = await fetch(`${base}/summary`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
              body: JSON.stringify({ messageId: message.id, revision: conversation.revision }),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]),
            });
            const result = await readLongTask<{ text: string }>(response, progress => { if (mounted.current) setStatus(progress); });
            if (await onAppend(result.text)) {
              setAdded(current => [...current, message.id]);
              setStatus('확정 내용·검토할 제안·남은 질문만 정리해 노트에 추가했습니다.');
            } else setStatus('노트 저장 상태를 확인해주세요.');
          }
          catch (error) { setStatus(error instanceof DOMException && error.name === 'AbortError' ? '핵심 정리를 중단했습니다. 노트는 변경되지 않았습니다.' : error instanceof Error ? error.message : '핵심 정리를 노트에 추가하지 못했습니다.'); }
          finally { abortRef.current = null; setAppending(false); setAppendingMessageId(''); }
        }}>{added.includes(message.id) ? '정리해 추가됨' : appendingMessageId === message.id && appendingKind === 'summary' ? '핵심 정리 중...' : '핵심 정리해 노트에 추가'}</Button>
        <Button size="sm" variant="outline" disabled={busy || appending || applyingEdit} onClick={async () => {
          setAppending(true); setAppendingMessageId(message.id); setAppendingKind('edit'); setEditPlan(null);
          try {
            setStatus('작가의 요청을 기준으로 기존 노트의 변경 위치를 찾고 있습니다.');
            if (!await beforeSend()) throw new Error('노트를 먼저 저장해주세요.');
            const controller = new AbortController(); abortRef.current = controller;
            const response = await fetch(`${base}/edit-plan`, {
              method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
              body: JSON.stringify({ messageId: message.id, revision: conversation.revision }),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]),
            });
            const plan = await readLongTask<StorylineNoteEditPlan>(response, progress => { if (mounted.current) setStatus(progress); });
            setEditPlan({ ...plan, messageId: message.id });
            setStatus('노트 변경안을 만들었습니다. 내용을 확인한 뒤 승인해주세요.');
          } catch (error) {
            setStatus(error instanceof DOMException && error.name === 'AbortError' ? '노트 변경안 생성을 중단했습니다.' : error instanceof Error ? error.message : '노트 변경안을 만들지 못했습니다.');
          } finally { abortRef.current = null; setAppending(false); setAppendingMessageId(''); }
        }}>{appendingMessageId === message.id && appendingKind === 'edit' ? '수정안 만드는 중...' : '노트 수정안 만들기'}</Button></div>}
        {message.role === 'assistant' && editPlan?.messageId === message.id && <section className="mt-3 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div><p className="text-xs font-semibold text-primary">노트 변경안</p><p className="mt-1 text-sm leading-6">{editPlan.summary}</p></div>
          {editPlan.edits.map((edit, index) => <div className="grid gap-2 rounded-lg border border-border bg-background/70 p-3" key={`${index}:${edit.original}`}>
            <div><p className="text-[11px] font-semibold text-muted-foreground">현재 내용</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{edit.original}</p></div>
            <div><p className="text-[11px] font-semibold text-primary">변경 후</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5">{edit.replacement || '(삭제)'}</p></div>
            <p className="text-[11px] leading-5 text-muted-foreground">{edit.reason}</p>
          </div>)}
          {editPlan.addition && <div className="rounded-lg border border-border bg-background/70 p-3"><p className="text-[11px] font-semibold text-primary">새로 추가</p><div className="mt-1 whitespace-pre-wrap text-xs leading-5">{editPlan.addition}</div></div>}
          {!!editPlan.warnings.length && <ul className="space-y-1 text-xs leading-5 text-amber-600">{editPlan.warnings.map(warning => <li key={warning}>• {warning}</li>)}</ul>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={applyingEdit} onClick={async () => {
              setApplyingEdit(true);
              try {
                if (await onApplyEdits(editPlan)) { setEditPlan(null); setStatus('승인한 변경안을 노트에 반영하고 저장했습니다.'); }
                else setStatus('노트가 달라져 변경안을 안전하게 적용하지 못했습니다. 수정안을 다시 만들어주세요.');
              } catch { setStatus('노트 변경안을 반영하지 못했습니다. 원문을 확인해주세요.'); }
              finally { setApplyingEdit(false); }
            }}>승인하고 반영</Button>
            <Button size="sm" variant="ghost" disabled={applyingEdit} onClick={() => { setEditPlan(null); setStatus('노트 변경안을 취소했습니다.'); }}>취소</Button>
          </div>
        </section>}
      </article>)}
      {pendingQuestion && <div className="rounded-xl bg-primary/10 p-3 text-sm whitespace-pre-wrap">{pendingQuestion}</div>}
      {draft && <div className="rounded-xl border border-border p-3 text-sm leading-7 whitespace-pre-wrap">{draft}{!busy && <p className="mt-2 text-xs text-muted-foreground">미완료 응답 · 저장되지 않음</p>}</div>}
    </div>
    <form className="space-y-2 border-t border-border p-4" onSubmit={event => { event.preventDefault(); void send(); }}>
      <p className="text-xs leading-5 text-muted-foreground" role="status">{status || '최근 대화 60개를 노트별로 보관합니다. 긴 자료와 대화는 일부를 골라 참조합니다.'}</p>
      <textarea aria-label="스토리라인 AI에게 질문" className="w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-6" rows={3} maxLength={3000} value={input} disabled={busy || appending || applyingEdit}
        placeholder="이 사건 다음에 어떤 선택을 하게 하면 자연스러울까?" onChange={event => setInput(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter로 전송</span>
        {busy || appending ? <Button type="button" size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>중단</Button>
          : <Button type="submit" size="sm" disabled={!ready || !input.trim() || applyingEdit}>전송</Button>}
      </div>
    </form>
  </aside>;
}
