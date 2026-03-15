'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import type {
  StoryPlanningCharacter,
  StoryPlanningDraft,
  StoryPlanningMessage,
  StoryPlanningPhase,
} from '@/lib/ai/story-planning-types';
import { EMPTY_DRAFT, PHASE_LABELS, PHASE_ORDER } from '@/lib/ai/story-planning-types';

const STORAGE_KEY = 'muse-novel-story-planning';

// Strip top-level JSON objects (>50 chars, valid JSON.parse) from display text.
// Needed: AI sometimes embeds raw draft JSON in conversational output, and old
// localStorage messages may still contain unstripped JSON blocks.
function stripJsonFromDisplay(text: string): string {
  let result = '';
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"' && depth > 0) { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const block = text.slice(start, i + 1);
        // Only strip substantial JSON blocks, not small inline braces
        if (block.length > 50) {
          try {
            JSON.parse(block);
            start = -1;
            continue;
          } catch {
            // invalid JSON — keep as text
          }
        }
        result += text.slice(start, i + 1);
        start = -1;
        continue;
      }
    }

    if (depth === 0) {
      result += ch;
    }
  }

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

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
      draft.plotStructure ||
      draft.pointOfView ||
      draft.writingStyle ||
      draft.formatGoal ||
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
            onChange={(e) => setProviderType(e.target.value)}
            value={providerType}
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
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            onChange={(e) => setModelName(e.target.value)}
            placeholder="gpt-4o-mini"
            type="text"
            value={modelName}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">API Key (선택)</label>
          <input
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            type="password"
            value={apiKey}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Base URL (선택)</label>
          <input
            className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
            type="text"
            value={baseUrl}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <Button disabled={saving} onClick={handleSave} size="sm">
        {saving ? '저장 중...' : '설정 저장'}
      </Button>
    </div>
  );
}

// ─── Character Expanded Detail Fields ───────────────────────────────────────
function CharacterExpandedDetails({ character }: { character: StoryPlanningCharacter }) {
  const hasExtra =
    character.appearance || character.personality || character.backstory || character.arcDescription || (character.items && character.items.length > 0);

  if (!hasExtra) return null;

  return (
    <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
      {character.appearance && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">외모</span>
          <p className="text-sm whitespace-pre-wrap">{character.appearance}</p>
        </div>
      )}
      {character.personality && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">성격</span>
          <p className="text-sm whitespace-pre-wrap">{character.personality}</p>
        </div>
      )}
      {character.backstory && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">배경</span>
          <p className="text-sm whitespace-pre-wrap">{character.backstory}</p>
        </div>
      )}
      {character.arcDescription && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">캐릭터 아크</span>
          <p className="text-sm whitespace-pre-wrap">{character.arcDescription}</p>
        </div>
      )}
      {character.items && character.items.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">🎒 소지품</span>
          <div className="mt-1 space-y-1">
            {character.items.map((item, j) => (
              <div className="rounded-xs bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1" key={j}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{item.name}</span>
                  {item.status && (
                    <span className="text-xs text-muted-foreground">({item.status})</span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Phase Stepper ──────────────────────────────────────────────────────────
function PhaseStepper({ currentPhase }: { currentPhase?: StoryPlanningPhase }) {
  const currentIndex = currentPhase ? PHASE_ORDER.indexOf(currentPhase) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">진행 단계</h4>
      <div className="flex flex-wrap gap-1.5">
        {PHASE_ORDER.map((phase, i) => {
          const isComplete = i < currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                isComplete
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : isCurrent
                    ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                    : 'bg-muted text-muted-foreground'
              }`}
              key={phase}
            >
              {isComplete ? '✓ ' : isCurrent ? '● ' : ''}{PHASE_LABELS[phase]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Draft Summary Panel ────────────────────────────────────────────────────
function DraftPanel({
  draft,
  onAcceptCharacter,
  onRejectCharacter,
  onAcceptWorld,
  onRejectWorld,
}: {
  draft: StoryPlanningDraft;
  onAcceptCharacter: (index: number) => void;
  onRejectCharacter: (index: number) => void;
  onAcceptWorld: (index: number) => void;
  onRejectWorld: (index: number) => void;
}) {
  const [expandedCharIndex, setExpandedCharIndex] = useState<number | null>(null);
  const [expandedPendingCharIndex, setExpandedPendingCharIndex] = useState<number | null>(null);
  const hasContent = hasDraftContent(draft);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">📋 기획 초안</h3>

      {!hasContent && (
        <p className="text-xs text-muted-foreground">
          AI와 대화하면 여기에 기획 초안이 정리됩니다.
        </p>
      )}

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
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                key={i}
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
            {draft.characters.map((ch, i) => {
              const isExpanded = expandedCharIndex === i;
              return (
                <div
                  className="rounded bg-muted/50 px-2 py-1 cursor-pointer hover:bg-muted/80 transition-colors"
                  key={i}
                  onClick={() => setExpandedCharIndex(isExpanded ? null : i)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{ch.name}</span>
                      {ch.role && (
                        <span className="ml-1 text-xs text-muted-foreground">— {ch.role}</span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  {!isExpanded && ch.personality && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ch.personality}</p>
                  )}
                  {!isExpanded && ch.items && ch.items.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">🎒 소지품</span>
                      {ch.items.map((item, j) => (
                        <span
                          className="inline-flex text-xs px-1.5 py-0.5 rounded-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                          key={j}
                        >
                          {item.name}{item.status ? ` (${item.status})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {isExpanded && (
                    <CharacterExpandedDetails character={ch} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {draft.pendingCharacters && draft.pendingCharacters.length > 0 && (
        <div>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            ✨ 제안된 등장인물 ({draft.pendingCharacters.length})
          </span>
          <div className="mt-1 space-y-1.5">
            {draft.pendingCharacters.map((ch, i) => {
              const isExpanded = expandedPendingCharIndex === i;
              return (
                <div
                  className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-950/50 transition-colors"
                  key={i}
                  onClick={() => setExpandedPendingCharIndex(isExpanded ? null : i)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{ch.name}</span>
                        {ch.role && (
                          <span className="ml-1 text-xs text-muted-foreground">— {ch.role}</span>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/70 transition-colors"
                        onClick={() => onAcceptCharacter(i)}
                      >
                        수락
                      </button>
                      <button
                        className="rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
                        onClick={() => onRejectCharacter(i)}
                      >
                        거부
                      </button>
                    </div>
                  </div>
                  {!isExpanded && ch.personality && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ch.personality}</p>
                  )}
                  {!isExpanded && ch.items && ch.items.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">🎒 소지품</span>
                      {ch.items.map((item, j) => (
                        <span
                          className="inline-flex text-xs px-1.5 py-0.5 rounded-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                          key={j}
                        >
                          {item.name}{item.status ? ` (${item.status})` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {isExpanded && (
                    <CharacterExpandedDetails character={ch} />
                  )}
                </div>
              );
            })}
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
              <div className="rounded bg-muted/50 px-2 py-1" key={i}>
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
      {draft.pendingWorldEntries && draft.pendingWorldEntries.length > 0 && (
        <div>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            ✨ 제안된 세계관 ({draft.pendingWorldEntries.length})
          </span>
          <div className="mt-1 space-y-1.5">
            {draft.pendingWorldEntries.map((we, i) => (
              <div
                className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5"
                key={i}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs text-muted-foreground">[{we.category}]</span>{' '}
                    <span className="text-sm font-medium">{we.title}</span>
                    {we.content && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {we.content}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/70 transition-colors"
                      onClick={() => onAcceptWorld(i)}
                    >
                      수락
                    </button>
                    <button
                      className="rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/70 transition-colors"
                      onClick={() => onRejectWorld(i)}
                    >
                      거부
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {draft.plotStructure && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">플롯/타임라인</span>
          <p className="text-sm whitespace-pre-wrap">{draft.plotStructure}</p>
        </div>
      )}
      {draft.pointOfView && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">시점</span>
          <p className="text-sm">{draft.pointOfView}</p>
        </div>
      )}
      {draft.writingStyle && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">문체</span>
          <p className="text-sm">{draft.writingStyle}</p>
        </div>
      )}
      {draft.formatGoal && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">분량/형식 목표</span>
          <p className="text-sm">{draft.formatGoal}</p>
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
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">소설로 적용</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          현재 기획 초안을 새 소설 프로젝트로 추가합니다.
        </p>
      </div>

      {hasContent && !canApply && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          제목이 정리되면 바로 소설 목록에 추가할 수 있습니다.
        </p>
      )}

      <Button
        className="w-full"
        disabled={!hasContent || !canApply || isApplying || isLoading}
        onClick={onApply}
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

  const cleaned = stripJsonFromDisplay(message.content);

  return (
    <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-muted prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-headings:my-2 prose-strong:text-inherit prose-a:text-primary dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {cleaned}
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

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMsg: StoryPlanningMessage = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setError('');
    setIsLoading(true);

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
          setMessages(messages);
          saveSession({ messages, draft });
          return;
        }
        throw new Error(data.error || 'AI 응답 실패');
      }

      const assistantMsg: StoryPlanningMessage = {
        role: 'assistant',
        content: data.reply,
        options: data.options,
      };
      const updatedMessages = [...newMessages, assistantMsg];
      const updatedDraft = data.draft ?? draft;

      setMessages(updatedMessages);
      setDraft(updatedDraft);
      saveSession({ messages: updatedMessages, draft: updatedDraft });
      setNoProvider(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 응답 중 오류가 발생했습니다.');
      setMessages(messages);
      saveSession({ messages, draft });
    } finally {
      setIsLoading(false);
    }
  }

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

  const handleAcceptCharacter = (index: number) => {
    setDraft((prev) => {
      const pending = prev.pendingCharacters ?? [];
      const accepted = pending[index];
      if (!accepted) return prev;
      const nextPending = pending.filter((_, i) => i !== index);
      const newDraft: StoryPlanningDraft = {
        ...prev,
        characters: [...prev.characters, accepted],
        pendingCharacters: nextPending.length > 0 ? nextPending : undefined,
      };
      saveSession({ messages, draft: newDraft });
      return newDraft;
    });
  };

  const handleRejectCharacter = (index: number) => {
    setDraft((prev) => {
      const nextPending = (prev.pendingCharacters ?? []).filter((_, i) => i !== index);
      const newDraft: StoryPlanningDraft = {
        ...prev,
        pendingCharacters: nextPending.length > 0 ? nextPending : undefined,
      };
      saveSession({ messages, draft: newDraft });
      return newDraft;
    });
  };

  const handleAcceptWorld = (index: number) => {
    setDraft((prev) => {
      const pending = prev.pendingWorldEntries ?? [];
      const accepted = pending[index];
      if (!accepted) return prev;
      const nextPending = pending.filter((_, i) => i !== index);
      const newDraft: StoryPlanningDraft = {
        ...prev,
        worldEntries: [...prev.worldEntries, accepted],
        pendingWorldEntries: nextPending.length > 0 ? nextPending : undefined,
      };
      saveSession({ messages, draft: newDraft });
      return newDraft;
    });
  };

  const handleRejectWorld = (index: number) => {
    setDraft((prev) => {
      const nextPending = (prev.pendingWorldEntries ?? []).filter((_, i) => i !== index);
      const newDraft: StoryPlanningDraft = {
        ...prev,
        pendingWorldEntries: nextPending.length > 0 ? nextPending : undefined,
      };
      saveSession({ messages, draft: newDraft });
      return newDraft;
    });
  };

  const canApply = Boolean(draft.title?.trim());
  const hasAnyDraft = hasDraftContent(draft);
  const lastMessage = messages.at(-1);
  const lastAssistantOptions =
    lastMessage?.role === 'assistant' ? lastMessage.options ?? [] : [];

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
          <form className="mt-6 w-full max-w-2xl flex gap-2" onSubmit={handleSubmit}>
            <textarea
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="어떤 소설을 구상하고 싶으신가요? 자유롭게 입력하세요... (Shift+Enter로 줄바꿈)"
              ref={textareaRef}
              rows={3}
              value={input}
            />
            <Button
              className="self-end"
              disabled={!input.trim() || isLoading}
              type="submit"
            >
              {isLoading ? '전송 중...' : '전송'}
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                className="rounded-full border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                key={suggestion}
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
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                key={i}
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

            {!isLoading && lastAssistantOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {lastAssistantOptions.map((option) => (
                  <button
                    className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary hover:bg-primary/15 transition-colors"
                    key={option}
                    onClick={() => sendMessage(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

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
          <form className="flex gap-2" onSubmit={handleSubmit}>
            <textarea
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={isLoading || isApplying}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="아이디어를 입력하세요... (Shift+Enter로 줄바꿈)"
              ref={textareaRef}
              rows={3}
              value={input}
            />
            <Button
              className="self-end"
              disabled={!input.trim() || isLoading || isApplying}
              type="submit"
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
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs transition-colors hover:bg-accent"
                  key={s}
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
            <PhaseStepper currentPhase={draft.currentPhase} />
            <DraftPanel
              draft={draft}
              onAcceptCharacter={handleAcceptCharacter}
              onAcceptWorld={handleAcceptWorld}
              onRejectCharacter={handleRejectCharacter}
              onRejectWorld={handleRejectWorld}
            />

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
        <PhaseStepper currentPhase={draft.currentPhase} />
        <DraftPanel
          draft={draft}
          onAcceptCharacter={handleAcceptCharacter}
          onAcceptWorld={handleAcceptWorld}
          onRejectCharacter={handleRejectCharacter}
          onRejectWorld={handleRejectWorld}
        />

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
