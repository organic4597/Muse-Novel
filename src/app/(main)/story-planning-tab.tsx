'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import type {
  StoryPlanningDraft,
  StoryPlanningMessage,
} from '@/lib/ai/story-planning-types';
import { EMPTY_DRAFT } from '@/lib/ai/story-planning-types';

const STORAGE_KEY = 'muse-novel-story-planning';

interface StoredSession {
  messages: StoryPlanningMessage[];
  draft: StoryPlanningDraft;
}

function loadSession(): StoredSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        draft: parsed.draft ?? { ...EMPTY_DRAFT },
      };
    }
  } catch {}
  return { messages: [], draft: { ...EMPTY_DRAFT } };
}

function saveSession(session: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function hasDraftContent(draft: StoryPlanningDraft) {
  return Boolean(
    draft.title ||
      draft.genre ||
      draft.synopsis ||
      draft.premise ||
      draft.tone ||
      (draft.themes && draft.themes.length > 0) ||
      draft.characters.length > 0 ||
      draft.worldEntries.length > 0 ||
      draft.firstChapterOutline
  );
}

// ─── Suggested first messages ────────────────────────────────────────────────
const SUGGESTIONS = [
  '판타지 소설을 쓰고 싶어요',
  'SF 장르로 단편을 구상해 주세요',
  '일상 로맨스를 구상해 봅시다',
  '미스터리/추리 소설 아이디어가 있어요',
];

// ─── Inline AI Settings ─────────────────────────────────────────────────────
function GlobalAISettingsInline({
  onSaved,
}: {
  onSaved: () => void;
}) {
  const [providerType, setProviderType] = useState('openai');
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!modelName.trim()) {
      setError('모델명을 입력해주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/global-ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType,
          modelName: modelName.trim(),
          apiKeyEncrypted: apiKey.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
          isDefault: true,
        }),
      });
      if (!res.ok) throw new Error('저장 실패');
      onSaved();
    } catch {
      setError('설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">공용 AI 설정</h3>
      <p className="text-xs text-muted-foreground">
        스토리 구상에 사용할 AI를 설정하세요. 환경변수 대신 여기서 직접 지정할 수 있습니다.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Provider</label>
          <select
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={providerType}
            onChange={(e) => setProviderType(e.target.value)}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama</option>
            <option value="nvidia">NVIDIA</option>
            <option value="koboldcpp">KoboldCpp</option>
            <option value="qwen-local">Qwen Local</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">모델명</label>
          <input
            type="text"
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">API Key (선택)</label>
          <input
            type="password"
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Base URL (선택)</label>
          <input
            type="text"
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? '저장 중...' : '설정 저장'}
      </Button>
    </div>
  );
}

// ─── Draft Summary Panel ────────────────────────────────────────────────────
function DraftPanel({ draft }: { draft: StoryPlanningDraft }) {
  const hasContent = hasDraftContent(draft);

  if (!hasContent) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">📋 기획 초안</h3>

      {draft.title && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">제목</span>
          <p className="text-sm">{draft.title}</p>
        </div>
      )}
      {draft.genre && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">장르</span>
          <p className="text-sm">{draft.genre}</p>
        </div>
      )}
      {draft.synopsis && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">시놉시스</span>
          <p className="text-sm whitespace-pre-wrap">{draft.synopsis}</p>
        </div>
      )}
      {draft.premise && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">전제/핵심 갈등</span>
          <p className="text-sm">{draft.premise}</p>
        </div>
      )}
      {draft.tone && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">톤/분위기</span>
          <p className="text-sm">{draft.tone}</p>
        </div>
      )}
      {draft.themes && draft.themes.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">주제</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {draft.themes.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
      {draft.characters.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            등장인물 ({draft.characters.length})
          </span>
          <div className="mt-1 space-y-1">
            {draft.characters.map((ch, i) => (
              <div key={i} className="rounded bg-muted/50 px-2 py-1">
                <span className="text-sm font-medium">{ch.name}</span>
                {ch.role && (
                  <span className="ml-1 text-xs text-muted-foreground">— {ch.role}</span>
                )}
                {ch.personality && (
                  <p className="text-xs text-muted-foreground mt-0.5">{ch.personality}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {draft.worldEntries.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            세계관 ({draft.worldEntries.length})
          </span>
          <div className="mt-1 space-y-1">
            {draft.worldEntries.map((we, i) => (
              <div key={i} className="rounded bg-muted/50 px-2 py-1">
                <span className="text-xs text-muted-foreground">[{we.category}]</span>{' '}
                <span className="text-sm font-medium">{we.title}</span>
                {we.content && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {we.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {draft.firstChapterOutline && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">첫 챕터 개요</span>
          <p className="text-sm whitespace-pre-wrap">{draft.firstChapterOutline}</p>
        </div>
      )}
    </div>
  );
}

function ApplyDraftPanel({
  canApply,
  hasContent,
  isApplying,
  isLoading,
  onApply,
}: {
  canApply: boolean;
  hasContent: boolean;
  isApplying: boolean;
  isLoading: boolean;
  onApply: () => void;
}) {
  if (!hasContent) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">소설로 적용</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          현재 기획 초안을 새 소설 프로젝트로 추가합니다.
        </p>
      </div>

      {!canApply && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          제목이 정리되면 바로 소설 목록에 추가할 수 있습니다.
        </p>
      )}

      <Button
        className="w-full"
        onClick={onApply}
        disabled={!canApply || isApplying || isLoading}
      >
        {isApplying ? '생성 중...' : '🚀 이 기획으로 소설 목록에 추가'}
      </Button>
    </div>
  );
}

function StoryPlanningMessageContent({ message }: { message: StoryPlanningMessage }) {
  if (message.role === 'user') {
    return <div className="whitespace-pre-wrap">{message.content}</div>;
  }

  return (
    <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-muted prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-headings:my-2 prose-strong:text-inherit prose-a:text-primary dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {message.content}
      </ReactMarkdown>
    </div>
  );
}

// ─── Main Story Planning Tab ────────────────────────────────────────────────
export function StoryPlanningTab() {
  const router = useRouter();
  const [messages, setMessages] = useState<StoryPlanningMessage[]>([]);
  const [draft, setDraft] = useState<StoryPlanningDraft>({ ...EMPTY_DRAFT });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [noProvider, setNoProvider] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load session on mount
  useEffect(() => {
    const session = loadSession();
    setMessages(session.messages);
    setDraft(session.draft);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: StoryPlanningMessage = { role: 'user', content: text.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput('');
      setError('');
      setIsLoading(true);

      // Save immediately with user message
      saveSession({ messages: newMessages, draft });

      try {
        const res = await fetch('/api/story-planning/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages, draft }),
        });

        const data = await res.json();

        if (!res.ok) {
          if (data.error === 'no_provider') {
            setNoProvider(true);
            setShowSettings(true);
            // Remove the user message since we couldn't process it
            setMessages(messages);
            saveSession({ messages, draft });
            return;
          }
          throw new Error(data.error || 'AI 응답 실패');
        }

        const assistantMsg: StoryPlanningMessage = {
          role: 'assistant',
          content: data.reply,
        };
        const updatedMessages = [...newMessages, assistantMsg];
        const updatedDraft = data.draft ?? draft;

        setMessages(updatedMessages);
        setDraft(updatedDraft);
        saveSession({ messages: updatedMessages, draft: updatedDraft });
        setNoProvider(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI 응답 중 오류가 발생했습니다.');
        // Revert messages on error
        setMessages(messages);
        saveSession({ messages, draft });
      } finally {
        setIsLoading(false);
      }
    },
    [messages, draft, isLoading]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleApply = async () => {
    if (!draft.title?.trim()) {
      setError('소설 제목이 아직 정해지지 않았습니다. 대화를 통해 제목을 먼저 정해주세요.');
      return;
    }

    setIsApplying(true);
    setError('');

    try {
      const res = await fetch('/api/story-planning/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '프로젝트 생성 실패');

      // Clear session and navigate
      clearSession();
      localStorage.removeItem('muse-novel-home-tab');
      router.push(`/projects/${data.projectId}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '프로젝트 생성 중 오류가 발생했습니다.'
      );
    } finally {
      setIsApplying(false);
    }
  };

  const handleReset = () => {
    if (!confirm('현재 구상 내용을 모두 삭제하시겠습니까?')) return;
    setMessages([]);
    setDraft({ ...EMPTY_DRAFT });
    setInput('');
    setError('');
    clearSession();
  };

  const canApply = Boolean(draft.title?.trim());
  const hasAnyDraft = hasDraftContent(draft);

  // ─── Empty state ────────────────────────────────────────────────────────
  if (messages.length === 0 && !showSettings) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-4xl mb-4">💡</div>
          <h2 className="text-xl font-semibold">스토리 구상</h2>
          <p className="mt-2 text-sm text-muted-foreground text-center max-w-lg">
            AI와 대화하며 소설의 설정, 등장인물, 세계관을 함께 구상하세요.
            <br />
            완성된 기획으로 바로 새 소설 프로젝트를 만들 수 있습니다.
          </p>

          {/* Direct input */}
          <form onSubmit={handleSubmit} className="mt-6 w-full max-w-2xl flex gap-2">
            <textarea
              ref={textareaRef}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="어떤 소설을 구상하고 싶으신가요? 자유롭게 입력하세요... (Shift+Enter로 줄바꿈)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="self-end"
            >
              {isLoading ? '전송 중...' : '전송'}
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => sendMessage(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <button
            className="mt-6 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => setShowSettings(true)}
          >
            공용 AI 설정 변경
          </button>
        </div>

        {noProvider && (
          <GlobalAISettingsInline
            onSaved={() => {
              setNoProvider(false);
              setShowSettings(false);
            }}
          />
        )}
      </div>
    );
  }

  // ─── Chat + Draft view ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Settings panel (collapsible) */}
      {showSettings && (
        <div className="relative">
          <GlobalAISettingsInline
            onSaved={() => {
              setNoProvider(false);
              setShowSettings(false);
            }}
          />
          <button
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground text-xs"
            onClick={() => setShowSettings(false)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_24rem] 2xl:grid-cols-[1fr_28rem] gap-4 xl:gap-6">
        {/* Chat panel */}
        <div className="min-w-0 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">💡 스토리 구상</h2>
            <div className="flex gap-2">
              <button
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => setShowSettings((v) => !v)}
              >
                AI 설정
              </button>
              <button
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={handleReset}
              >
                초기화
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="max-h-[55vh] lg:max-h-[60vh] xl:max-h-[70vh] overflow-y-auto space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-card-foreground border border-border'
                  }`}
                >
                  <StoryPlanningMessageContent message={msg} />
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-card border border-border px-3 py-2 text-sm text-muted-foreground">
                  생각하는 중...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <textarea
              ref={textareaRef}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="아이디어를 입력하세요... (Shift+Enter로 줄바꿈)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isApplying}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading || isApplying}
              className="self-end"
            >
              전송
            </Button>
          </form>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {/* Quick suggestions */}
          {messages.length > 0 && messages.length < 4 && !isLoading && (
            <div className="flex flex-wrap gap-1.5">
              {[
                '등장인물을 더 구체화해 줘',
                '세계관 배경을 추가하자',
                '첫 챕터 개요를 잡아볼까?',
              ].map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs transition-colors hover:bg-accent"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Draft summary panel — sticky */}
        <div className="hidden lg:block">
          <div className="sticky top-20 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <DraftPanel draft={draft} />

          <ApplyDraftPanel
            canApply={canApply}
            hasContent={hasAnyDraft}
            isApplying={isApplying}
            isLoading={isLoading}
            onApply={handleApply}
          />
          </div>
        </div>
      </div>

      {/* Mobile draft panel (below chat) */}
      <div className="lg:hidden space-y-4">
        <DraftPanel draft={draft} />

        <ApplyDraftPanel
          canApply={canApply}
          hasContent={hasAnyDraft}
          isApplying={isApplying}
          isLoading={isLoading}
          onApply={handleApply}
        />
      </div>
    </div>
  );
}
