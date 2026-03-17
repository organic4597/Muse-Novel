'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { buildStoryPlanningOptions } from '@/lib/ai/story-planning-phase-config';
import type {
  StoryPlanningCharacter,
  StoryPlanningDraft,
  StoryPlanningMessage,
  StoryPlanningWorldEntry,
} from '@/lib/ai/story-planning-types';
import {
  EMPTY_DRAFT,
} from '@/lib/ai/story-planning-types';

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

function normalizeDraftShape(draft: StoryPlanningDraft | null | undefined): StoryPlanningDraft {
  const nextDraft: Partial<StoryPlanningDraft> = draft ?? {};

  return {
    ...EMPTY_DRAFT,
    ...nextDraft,
    themes: Array.isArray(nextDraft.themes) ? nextDraft.themes : [],
    characters: Array.isArray(nextDraft.characters) ? nextDraft.characters : [],
    worldEntries: Array.isArray(nextDraft.worldEntries) ? nextDraft.worldEntries : [],
    pendingCharacters: Array.isArray(nextDraft.pendingCharacters)
      ? nextDraft.pendingCharacters
      : undefined,
    pendingWorldEntries: Array.isArray(nextDraft.pendingWorldEntries)
      ? nextDraft.pendingWorldEntries
      : undefined,
  };
}

function loadSession(): StoredSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        draft: normalizeDraftShape(parsed.draft),
      };
    }
  } catch {}
  return { messages: [], draft: normalizeDraftShape(undefined) };
}

function saveSession(session: StoredSession) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      messages: session.messages,
      draft: normalizeDraftShape(session.draft),
    })
  );
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function updateCharacterField(
  character: StoryPlanningCharacter,
  field: keyof StoryPlanningCharacter,
  value: string
): StoryPlanningCharacter {
  const trimmed = value.trim();

  if (!trimmed && field !== 'name') {
    const { [field]: _removed, ...nextCharacter } = character;
    return nextCharacter as StoryPlanningCharacter;
  }

  return {
    ...character,
    [field]: trimmed,
  };
}

function updateWorldField(
  entry: StoryPlanningWorldEntry,
  field: keyof StoryPlanningWorldEntry,
  value: string
): StoryPlanningWorldEntry {
  const trimmed = value.trim();

  if (!trimmed && field === 'content') {
    const { content: _removed, ...nextEntry } = entry;
    return nextEntry;
  }

  return {
    ...entry,
    [field]: trimmed,
  };
}

function normalizePendingIdentity(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function getPendingCharacterIdentity(character: Pick<StoryPlanningCharacter, 'name' | 'role'>) {
  const normalizedName = normalizePendingIdentity(character.name);
  if (normalizedName && normalizedName !== '이름 없음') {
    return `name:${normalizedName}`;
  }

  const normalizedRole = normalizePendingIdentity(character.role);
  if (normalizedRole) {
    return `role:${normalizedRole}`;
  }

  return 'placeholder';
}

function mergeReplacementPendingCharacters(
  existing: StoryPlanningDraft['pendingCharacters'],
  incoming: StoryPlanningDraft['pendingCharacters'],
  rejectedLabel: string
) {
  const next = [...(existing ?? [])];
  const existingKeys = new Set(next.map(getPendingCharacterIdentity));
  const rejectedKey = getPendingCharacterIdentity({ name: rejectedLabel, role: undefined });

  const replacement = (incoming ?? []).find((character) => {
    const identityKey = getPendingCharacterIdentity(character);
    return identityKey !== rejectedKey && !existingKeys.has(identityKey);
  });

  if (!replacement) {
    return next.length > 0 ? next : undefined;
  }

  return [...next, replacement];
}

function mergeReplacementPendingWorldEntries(
  existing: StoryPlanningDraft['pendingWorldEntries'],
  incoming: StoryPlanningDraft['pendingWorldEntries'],
  rejectedLabel: string
) {
  const next = [...(existing ?? [])];
  const existingTitles = new Set(next.map((entry) => normalizePendingIdentity(entry.title)));
  const rejectedTitle = normalizePendingIdentity(rejectedLabel);

  const replacement = (incoming ?? []).find((entry) => {
    const normalizedTitle = normalizePendingIdentity(entry.title);
    return normalizedTitle !== rejectedTitle && !existingTitles.has(normalizedTitle);
  });

  if (!replacement) {
    return next.length > 0 ? next : undefined;
  }

  return [...next, replacement];
}

function findNewPendingCharacter(
  existing: StoryPlanningDraft['pendingCharacters'],
  next: StoryPlanningDraft['pendingCharacters']
) {
  const existingKeys = new Set((existing ?? []).map(getPendingCharacterIdentity));
  return (next ?? []).find((character) => !existingKeys.has(getPendingCharacterIdentity(character)));
}

function findNewPendingWorldEntry(
  existing: StoryPlanningDraft['pendingWorldEntries'],
  next: StoryPlanningDraft['pendingWorldEntries']
) {
  const existingTitles = new Set(
    (existing ?? []).map((entry) => normalizePendingIdentity(entry.title))
  );
  return (next ?? []).find((entry) => !existingTitles.has(normalizePendingIdentity(entry.title)));
}

function buildReplacementAssistantReply(
  kind: 'character' | 'world',
  rejectedLabel: string,
  previousDraft: StoryPlanningDraft,
  nextDraft: StoryPlanningDraft
) {
  if (kind === 'character') {
    const replacement = findNewPendingCharacter(previousDraft.pendingCharacters, nextDraft.pendingCharacters);
    if (replacement) {
      return `좋아요. **${rejectedLabel}**은 제외했고, 대신 **${replacement.name}** 후보를 추가해 뒀어요. 지금 남아 있는 후보들과 비교해서 어떤 인물이 더 맞는지 골라볼까요?`;
    }

    if ((nextDraft.pendingCharacters?.length ?? 0) > 0) {
      return `좋아요. **${rejectedLabel}**은 제외했어요. 우선 남아 있는 등장인물 후보들부터 비교해 볼까요? 원하면 원하는 역할이나 분위기를 더 말해 주시면 새 후보를 다시 뽑아볼게요.`;
    }

    return `좋아요. **${rejectedLabel}**은 제외했어요. 원하는 역할이나 분위기를 조금 더 말해 주시면 그 기준으로 새 등장인물 후보를 다시 제안할게요.`;
  }

  const replacement = findNewPendingWorldEntry(previousDraft.pendingWorldEntries, nextDraft.pendingWorldEntries);
  if (replacement) {
    return `좋아요. **${rejectedLabel}**은 제외했고, 대신 **${replacement.title}** 후보를 추가해 뒀어요. 지금 남아 있는 세계관 후보들과 비교해서 어떤 설정이 더 맞는지 골라볼까요?`;
  }

  if ((nextDraft.pendingWorldEntries?.length ?? 0) > 0) {
    return `좋아요. **${rejectedLabel}**은 제외했어요. 우선 남아 있는 세계관 후보들부터 비교해 볼까요? 원하면 더 밀고 싶은 분위기나 규칙을 말해 주시면 새 후보를 다시 제안할게요.`;
  }

  return `좋아요. **${rejectedLabel}**은 제외했어요. 더 원하는 배경 분위기나 세계 규칙을 말해 주시면 그 기준으로 새 세계관 후보를 다시 제안할게요.`;
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

// ─── Draft Summary Panel ────────────────────────────────────────────────────
function DraftPanel({
  draft,
  onAcceptCharacter,
  onRejectCharacter,
  onDeleteCharacter,
  onAcceptWorld,
  onRejectWorld,
  onDeleteWorld,
  onUpdateAcceptedCharacter,
  onUpdateAcceptedWorld,
  onUpdatePendingCharacter,
  onUpdatePendingWorld,
}: {
  draft: StoryPlanningDraft;
  onAcceptCharacter: (index: number) => void;
  onRejectCharacter: (index: number) => void;
  onDeleteCharacter: (index: number) => void;
  onAcceptWorld: (index: number) => void;
  onRejectWorld: (index: number) => void;
  onDeleteWorld: (index: number) => void;
  onUpdateAcceptedCharacter: (index: number, field: keyof StoryPlanningCharacter, value: string) => void;
  onUpdateAcceptedWorld: (index: number, field: keyof StoryPlanningWorldEntry, value: string) => void;
  onUpdatePendingCharacter: (index: number, field: keyof StoryPlanningCharacter, value: string) => void;
  onUpdatePendingWorld: (index: number, field: keyof StoryPlanningWorldEntry, value: string) => void;
}) {
  const [expandedCharIndex, setExpandedCharIndex] = useState<number | null>(null);
  const [editingAcceptedCharIndex, setEditingAcceptedCharIndex] = useState<number | null>(null);
  const [editingAcceptedWorldIndex, setEditingAcceptedWorldIndex] = useState<number | null>(null);
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
              const isEditing = editingAcceptedCharIndex === i;
              return (
                <div
                  className="rounded bg-muted/50 px-2 py-1 cursor-pointer hover:bg-muted/80 transition-colors"
                  key={i}
                  onClick={() => {
                    if (isEditing) return;
                    setExpandedCharIndex(isExpanded ? null : i);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{ch.name}</span>
                      {ch.role && (
                        <span className="ml-1 text-xs text-muted-foreground">— {ch.role}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 self-start" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="inline-flex h-6 items-center rounded px-2 py-0 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/70 transition-colors"
                        onClick={() => onDeleteCharacter(i)}
                        type="button"
                      >
                        삭제
                      </button>
                      <button
                        className="inline-flex h-6 items-center rounded px-2 py-0 text-xs font-medium bg-background text-foreground hover:bg-accent transition-colors"
                        onClick={() => {
                          if (isEditing) {
                            setEditingAcceptedCharIndex(null);
                            return;
                          }
                          setExpandedCharIndex(i);
                          setEditingAcceptedCharIndex(i);
                        }}
                        type="button"
                      >
                        {isEditing ? '완료' : '수정'}
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  {!isExpanded && !isEditing && ch.personality && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ch.personality}</p>
                  )}
                  {!isExpanded && !isEditing && ch.items && ch.items.length > 0 && (
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
                  {isEditing ? (
                    <div className="mt-2 space-y-2 border-t border-border/50 pt-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-medium"
                        onChange={(e) => onUpdateAcceptedCharacter(i, 'name', e.target.value)}
                        placeholder="이름"
                        value={ch.name}
                      />
                      <input
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                        onChange={(e) => onUpdateAcceptedCharacter(i, 'role', e.target.value)}
                        placeholder="역할"
                        value={ch.role ?? ''}
                      />
                      <textarea
                        className="min-h-16 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdateAcceptedCharacter(i, 'appearance', e.target.value)}
                        placeholder="외모"
                        value={ch.appearance ?? ''}
                      />
                      <textarea
                        className="min-h-16 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdateAcceptedCharacter(i, 'personality', e.target.value)}
                        placeholder="성격"
                        value={ch.personality ?? ''}
                      />
                      <textarea
                        className="min-h-16 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdateAcceptedCharacter(i, 'backstory', e.target.value)}
                        placeholder="배경"
                        value={ch.backstory ?? ''}
                      />
                      <textarea
                        className="min-h-16 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdateAcceptedCharacter(i, 'arcDescription', e.target.value)}
                        placeholder="캐릭터 아크"
                        value={ch.arcDescription ?? ''}
                      />
                    </div>
                  ) : isExpanded ? (
                    <CharacterExpandedDetails character={ch} />
                  ) : null}
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
                        <input
                          className="w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-sm font-medium"
                          onChange={(e) => onUpdatePendingCharacter(i, 'name', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="이름"
                          value={ch.name}
                        />
                        <input
                          className="mt-1 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs text-muted-foreground"
                          onChange={(e) => onUpdatePendingCharacter(i, 'role', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="역할"
                          value={ch.role ?? ''}
                        />
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
                  {!isExpanded && (
                    <textarea
                      className="mt-2 min-h-16 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs text-muted-foreground"
                      onChange={(e) => onUpdatePendingCharacter(i, 'personality', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="성격 / 메모"
                      value={ch.personality ?? ''}
                    />
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
                    <div className="mt-2 space-y-2 border-t border-amber-200/70 pt-2" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        className="min-h-16 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdatePendingCharacter(i, 'appearance', e.target.value)}
                        placeholder="외모"
                        value={ch.appearance ?? ''}
                      />
                      <textarea
                        className="min-h-16 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdatePendingCharacter(i, 'personality', e.target.value)}
                        placeholder="성격"
                        value={ch.personality ?? ''}
                      />
                      <textarea
                        className="min-h-16 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdatePendingCharacter(i, 'backstory', e.target.value)}
                        placeholder="배경"
                        value={ch.backstory ?? ''}
                      />
                      <textarea
                        className="min-h-16 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs"
                        onChange={(e) => onUpdatePendingCharacter(i, 'arcDescription', e.target.value)}
                        placeholder="캐릭터 아크"
                        value={ch.arcDescription ?? ''}
                      />
                    </div>
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
            {draft.worldEntries.map((we, i) => {
              const isEditing = editingAcceptedWorldIndex === i;
              return (
                <div className="rounded bg-muted/50 px-2 py-1" key={i}>
                  <div className={`flex justify-between gap-2 ${isEditing ? 'items-start' : 'items-center'}`}>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <input
                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                            onChange={(e) => onUpdateAcceptedWorld(i, 'category', e.target.value)}
                            placeholder="분류"
                            value={we.category}
                          />
                          <input
                            className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-medium"
                            onChange={(e) => onUpdateAcceptedWorld(i, 'title', e.target.value)}
                            placeholder="항목 이름"
                            value={we.title}
                          />
                          <textarea
                            className="min-h-16 w-full rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                            onChange={(e) => onUpdateAcceptedWorld(i, 'content', e.target.value)}
                            placeholder="설명"
                            value={we.content ?? ''}
                          />
                        </div>
                      ) : (
                        <>
                          <span className="text-xs text-muted-foreground">[{we.category}]</span>{' '}
                          <span className="text-sm font-medium">{we.title}</span>
                          {we.content && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {we.content}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 self-start">
                      <button
                        className="inline-flex h-6 items-center rounded px-2 py-0 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/70 transition-colors"
                        onClick={() => onDeleteWorld(i)}
                        type="button"
                      >
                        삭제
                      </button>
                      <button
                        className="inline-flex h-6 items-center rounded px-2 py-0 text-xs font-medium bg-background text-foreground hover:bg-accent transition-colors"
                        onClick={() => {
                          setEditingAcceptedWorldIndex(isEditing ? null : i);
                        }}
                        type="button"
                      >
                        {isEditing ? '완료' : '수정'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
                    <input
                      className="w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs text-muted-foreground"
                      onChange={(e) => onUpdatePendingWorld(i, 'category', e.target.value)}
                      placeholder="분류"
                      value={we.category}
                    />
                    <input
                      className="mt-1 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-sm font-medium"
                      onChange={(e) => onUpdatePendingWorld(i, 'title', e.target.value)}
                      placeholder="항목 이름"
                      value={we.title}
                    />
                    <textarea
                      className="mt-1 min-h-16 w-full rounded border border-amber-300/70 bg-background px-2 py-1 text-xs text-muted-foreground"
                      onChange={(e) => onUpdatePendingWorld(i, 'content', e.target.value)}
                      placeholder="설명"
                      value={we.content ?? ''}
                    />
                  </div>
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
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
  titleMissing,
  isApplying,
  isLoading,
  onApply,
}: {
  canApply: boolean;
  hasContent: boolean;
  titleMissing: boolean;
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

      {hasContent && !canApply && titleMissing && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          제목이 아직 draft에 반영되지 않았습니다. 채팅에서 제목을 정하거나, “제목 몇 개 추천해줘”처럼 바로 요청해 주세요.
        </p>
      )}

      {hasContent && !canApply && !titleMissing && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          제목과 기본 기획 정보가 정리되면 소설 목록에 추가할 수 있습니다.
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
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<StoryPlanningMessage[]>([]);
  const draftRef = useRef<StoryPlanningDraft>({ ...EMPTY_DRAFT });

  useEffect(() => {
    const session = loadSession();
    messagesRef.current = session.messages;
    draftRef.current = session.draft;
    setMessages(session.messages);
    setDraft(session.draft);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string, baseDraft?: StoryPlanningDraft) {
    if (!text.trim() || isLoading) return;

    const currentMessages = messagesRef.current;
    const currentDraft = baseDraft ?? draftRef.current;
    const userMsg: StoryPlanningMessage = { role: 'user', content: text.trim() };
    const newMessages = [...currentMessages, userMsg];
    messagesRef.current = newMessages;
    setMessages(newMessages);
    setInput('');
    setError('');
    setIsLoading(true);

    saveSession({ messages: newMessages, draft: currentDraft });

    try {
      const res = await fetch('/api/story-planning/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, draft: currentDraft }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'no_provider') {
          setError('AI 제공자가 설정되지 않았습니다. AI 설정 페이지에서 먼저 설정해주세요.');
          messagesRef.current = currentMessages;
          setMessages(currentMessages);
          saveSession({ messages: currentMessages, draft: currentDraft });
          return;
        }
        throw new Error(data.error || 'AI 응답 실패');
      }

      const assistantMsg: StoryPlanningMessage = {
        role: 'assistant',
        content: data.reply,
        options: data.options,
        draftSnapshot: data.draft ?? currentDraft,
      };
      const updatedMessages = [...newMessages, assistantMsg];
      const updatedDraft = data.draft ?? currentDraft;

      messagesRef.current = updatedMessages;
      draftRef.current = updatedDraft;
      setMessages(updatedMessages);
      setDraft(updatedDraft);
      saveSession({ messages: updatedMessages, draft: updatedDraft });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 응답 중 오류가 발생했습니다.');
      messagesRef.current = currentMessages;
      setMessages(currentMessages);
      saveSession({ messages: currentMessages, draft: currentDraft });
    } finally {
      setIsLoading(false);
    }
  }

  async function requestReplacementSuggestion(
    kind: 'character' | 'world',
    rejectedLabel: string,
    baseDraft: StoryPlanningDraft
  ) {
    if (isLoading) return;

    const currentMessages = messagesRef.current;
    const pendingLabels = kind === 'character'
      ? (baseDraft.pendingCharacters ?? []).map((character) => character.name)
      : (baseDraft.pendingWorldEntries ?? []).map((entry) => entry.title);
    const pendingContext = pendingLabels.length > 0
      ? ` 이미 제안되어 검토 중인 항목은 ${pendingLabels.map((label) => `"${label}"`).join(', ')} 이고, 이 항목들과 방금 거절한 항목은 다시 제안하지 마.`
      : ' 방금 거절한 항목은 다시 제안하지 마.';
    const retryPrompt = kind === 'character'
      ? `방금 제안한 등장인물 "${rejectedLabel}"은 제외하고, 그 한 항목만 대체할 새로운 등장인물 후보 1개만 제안해줘. 이미 검토 중인 다른 등장인물 후보들은 그대로 유지하고 다시 쓰거나 수정하지 마.${pendingContext}`
      : `방금 제안한 세계관 항목 "${rejectedLabel}"은 제외하고, 그 한 항목만 대체할 새로운 세계관 후보 1개만 제안해줘. 이미 검토 중인 다른 세계관 후보들은 그대로 유지하고 다시 쓰거나 수정하지 마.${pendingContext}`;
    const requestMessages: StoryPlanningMessage[] = [
      ...currentMessages,
      { role: 'user', content: retryPrompt },
    ];

    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/story-planning/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: requestMessages, draft: baseDraft }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'no_provider') {
          setError('AI 제공자가 설정되지 않았습니다. AI 설정 페이지에서 먼저 설정해주세요.');
          saveSession({ messages: currentMessages, draft: baseDraft });
          return;
        }
        throw new Error(data.error || '대체 제안 생성 실패');
      }

      const updatedDraft: StoryPlanningDraft = {
        ...(data.draft ?? baseDraft),
        pendingCharacters: kind === 'character'
          ? mergeReplacementPendingCharacters(
              baseDraft.pendingCharacters,
              data.draft?.pendingCharacters,
              rejectedLabel
            )
          : baseDraft.pendingCharacters,
        pendingWorldEntries: kind === 'world'
          ? mergeReplacementPendingWorldEntries(
              baseDraft.pendingWorldEntries,
              data.draft?.pendingWorldEntries,
              rejectedLabel
            )
          : baseDraft.pendingWorldEntries,
      };
      const assistantMsg: StoryPlanningMessage = {
        role: 'assistant',
        content: buildReplacementAssistantReply(kind, rejectedLabel, baseDraft, updatedDraft),
        options: buildStoryPlanningOptions(updatedDraft),
        draftSnapshot: updatedDraft,
      };
      const updatedMessages = [...currentMessages, assistantMsg];

      messagesRef.current = updatedMessages;
      draftRef.current = updatedDraft;
      setMessages(updatedMessages);
      setDraft(updatedDraft);
      saveSession({ messages: updatedMessages, draft: updatedDraft });
    } catch (err) {
      setError(err instanceof Error ? err.message : '대체 제안 생성 중 오류가 발생했습니다.');
      saveSession({ messages: currentMessages, draft: baseDraft });
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
      setError('소설 제목이 아직 draft에 반영되지 않았습니다. “제목 몇 개 추천해줘” 또는 “제목은 OO로 해줘”처럼 요청해 주세요.');
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
      const acceptedKey = `${accepted.name}::${accepted.role ?? ''}`;
      const hasExistingCharacter = prev.characters.some(
        (character) => `${character.name}::${character.role ?? ''}` === acceptedKey
      );
      const nextPending = pending.filter((_, i) => i !== index);
      const newDraft: StoryPlanningDraft = {
        ...prev,
        characters: hasExistingCharacter ? prev.characters : [...prev.characters, accepted],
        pendingCharacters: nextPending.length > 0 ? nextPending : undefined,
      };
      saveSession({ messages, draft: newDraft });
      return newDraft;
    });
  };

  const handleRejectCharacter = async (index: number) => {
    const pending = draftRef.current.pendingCharacters ?? [];
    const rejected = pending[index];
    if (!rejected) return;

    const nextPending = pending.filter((_, i) => i !== index);
    const newDraft: StoryPlanningDraft = {
      ...draftRef.current,
      pendingCharacters: nextPending.length > 0 ? nextPending : undefined,
    };

    draftRef.current = newDraft;
    setDraft(newDraft);
    saveSession({ messages: messagesRef.current, draft: newDraft });
    await requestReplacementSuggestion('character', rejected.name, newDraft);
  };

  const handleDeleteCharacter = (index: number) => {
    setDraft((prev) => {
      const target = prev.characters[index];
      if (!target) return prev;

      const nextCharacters = prev.characters.filter((_, characterIndex) => characterIndex !== index);
      const newDraft: StoryPlanningDraft = {
        ...prev,
        characters: nextCharacters,
      };

      draftRef.current = newDraft;
      saveSession({ messages: messagesRef.current, draft: newDraft });
      return newDraft;
    });
  };

  const handleDeleteWorld = (index: number) => {
    setDraft((prev) => {
      const target = prev.worldEntries[index];
      if (!target) return prev;

      const nextWorldEntries = prev.worldEntries.filter((_, entryIndex) => entryIndex !== index);
      const newDraft: StoryPlanningDraft = {
        ...prev,
        worldEntries: nextWorldEntries,
      };

      draftRef.current = newDraft;
      saveSession({ messages: messagesRef.current, draft: newDraft });
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

  const handleRejectWorld = async (index: number) => {
    const pending = draftRef.current.pendingWorldEntries ?? [];
    const rejected = pending[index];
    if (!rejected) return;

    const nextPending = pending.filter((_, i) => i !== index);
    const newDraft: StoryPlanningDraft = {
      ...draftRef.current,
      pendingWorldEntries: nextPending.length > 0 ? nextPending : undefined,
    };

    draftRef.current = newDraft;
    setDraft(newDraft);
    saveSession({ messages: messagesRef.current, draft: newDraft });
    await requestReplacementSuggestion('world', rejected.title, newDraft);
  };

  const handleUpdatePendingCharacter = (
    index: number,
    field: keyof StoryPlanningCharacter,
    value: string
  ) => {
    setDraft((prev) => {
      const pending = prev.pendingCharacters ?? [];
      const target = pending[index];
      if (!target) return prev;

      const nextPending = pending.map((character, pendingIndex) =>
        pendingIndex === index ? updateCharacterField(character, field, value) : character
      );
      const newDraft: StoryPlanningDraft = {
        ...prev,
        pendingCharacters: nextPending,
      };

      draftRef.current = newDraft;
      saveSession({ messages: messagesRef.current, draft: newDraft });
      return newDraft;
    });
  };

  const handleUpdatePendingWorld = (
    index: number,
    field: keyof StoryPlanningWorldEntry,
    value: string
  ) => {
    setDraft((prev) => {
      const pending = prev.pendingWorldEntries ?? [];
      const target = pending[index];
      if (!target) return prev;

      const nextPending = pending.map((entry, pendingIndex) =>
        pendingIndex === index ? updateWorldField(entry, field, value) : entry
      );
      const newDraft: StoryPlanningDraft = {
        ...prev,
        pendingWorldEntries: nextPending,
      };

      draftRef.current = newDraft;
      saveSession({ messages: messagesRef.current, draft: newDraft });
      return newDraft;
    });
  };

  const handleUpdateAcceptedCharacter = (
    index: number,
    field: keyof StoryPlanningCharacter,
    value: string
  ) => {
    setDraft((prev) => {
      const target = prev.characters[index];
      if (!target) return prev;

      const nextCharacters = prev.characters.map((character, characterIndex) =>
        characterIndex === index ? updateCharacterField(character, field, value) : character
      );
      const newDraft: StoryPlanningDraft = {
        ...prev,
        characters: nextCharacters,
      };

      draftRef.current = newDraft;
      saveSession({ messages: messagesRef.current, draft: newDraft });
      return newDraft;
    });
  };

  const handleUpdateAcceptedWorld = (
    index: number,
    field: keyof StoryPlanningWorldEntry,
    value: string
  ) => {
    setDraft((prev) => {
      const target = prev.worldEntries[index];
      if (!target) return prev;

      const nextWorldEntries = prev.worldEntries.map((entry, entryIndex) =>
        entryIndex === index ? updateWorldField(entry, field, value) : entry
      );
      const newDraft: StoryPlanningDraft = {
        ...prev,
        worldEntries: nextWorldEntries,
      };

      draftRef.current = newDraft;
      saveSession({ messages: messagesRef.current, draft: newDraft });
      return newDraft;
    });
  };

  const titleMissing = !draft.title?.trim();
  const hasCoreStoryData = Boolean(
    draft.genre?.trim() ||
      draft.synopsis?.trim() ||
      draft.premise?.trim() ||
      draft.characters.length > 0 ||
      draft.worldEntries.length > 0 ||
      draft.plotStructure?.trim() ||
      draft.firstChapterOutline?.trim()
  );
  const canApply = Boolean(draft.title?.trim()) && hasCoreStoryData;
  const hasAnyDraft = hasDraftContent(draft);
  const lastMessage = messages.at(-1);
  const lastAssistantDraft =
    lastMessage?.role === 'assistant' ? lastMessage.draftSnapshot : undefined;
  const lastAssistantOptions =
    lastMessage?.role === 'assistant' ? lastMessage.options ?? [] : [];
  const fallbackAssistantOptions =
    lastMessage?.role === 'assistant' ? buildStoryPlanningOptions(lastAssistantDraft ?? draft) : [];
  const visibleAssistantOptions =
    lastAssistantOptions.length > 0 ? lastAssistantOptions : fallbackAssistantOptions;

  // ─── Empty state ────────────────────────────────────────────────────────
  if (messages.length === 0) {
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

        </div>

        {error && (
          <div className="rounded-lg border border-border bg-card p-4 text-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Chat + Draft view ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_24rem] 2xl:grid-cols-[1fr_28rem] gap-4 xl:gap-6">
        {/* Chat panel */}
        <div className="min-w-0 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">💡 스토리 구상</h2>
            <div className="flex gap-2">
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

            {!isLoading && visibleAssistantOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {visibleAssistantOptions.map((option) => (
                  <button
                    className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary hover:bg-primary/15 transition-colors"
                    key={option}
                    onClick={() => sendMessage(option, lastAssistantDraft ?? draft)}
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

          {messages.length > 0 && !isLoading && visibleAssistantOptions.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {buildStoryPlanningOptions(draft).map((suggestion) => (
                <button
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs transition-colors hover:bg-accent"
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Draft summary panel — sticky */}
        <div className="hidden lg:block">
          <div className="sticky top-20 space-y-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <DraftPanel
              draft={draft}
              onAcceptCharacter={handleAcceptCharacter}
              onAcceptWorld={handleAcceptWorld}
              onDeleteCharacter={handleDeleteCharacter}
              onDeleteWorld={handleDeleteWorld}
              onRejectCharacter={handleRejectCharacter}
              onRejectWorld={handleRejectWorld}
              onUpdateAcceptedCharacter={handleUpdateAcceptedCharacter}
              onUpdateAcceptedWorld={handleUpdateAcceptedWorld}
              onUpdatePendingCharacter={handleUpdatePendingCharacter}
              onUpdatePendingWorld={handleUpdatePendingWorld}
            />

            <ApplyDraftPanel
              canApply={canApply}
              hasContent={hasAnyDraft}
              isApplying={isApplying}
              isLoading={isLoading}
              onApply={handleApply}
              titleMissing={titleMissing}
            />
          </div>
        </div>
      </div>

      {/* Mobile draft panel (below chat) */}
      <div className="lg:hidden space-y-4">
        <DraftPanel
          draft={draft}
          onAcceptCharacter={handleAcceptCharacter}
          onAcceptWorld={handleAcceptWorld}
          onDeleteCharacter={handleDeleteCharacter}
          onDeleteWorld={handleDeleteWorld}
          onRejectCharacter={handleRejectCharacter}
          onRejectWorld={handleRejectWorld}
          onUpdateAcceptedCharacter={handleUpdateAcceptedCharacter}
          onUpdateAcceptedWorld={handleUpdateAcceptedWorld}
          onUpdatePendingCharacter={handleUpdatePendingCharacter}
          onUpdatePendingWorld={handleUpdatePendingWorld}
        />

        <ApplyDraftPanel
          canApply={canApply}
          hasContent={hasAnyDraft}
          isApplying={isApplying}
          isLoading={isLoading}
          onApply={handleApply}
          titleMissing={titleMissing}
        />
      </div>
    </div>
  );
}
