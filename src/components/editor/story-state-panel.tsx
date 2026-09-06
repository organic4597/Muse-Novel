'use client';

import {
  ArchiveRestore,
  Check,
  CircleDotDashed,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  STORY_STATE_CATEGORIES,
  type StoryStateCategory,
  type StoryStateEntry,
} from '@/lib/story-state';
import { cn } from '@/lib/utils';

type CharacterOption = { id: string; name: string };

export type StoryStatePanelProps = {
  chapterId: string;
  chapterTitle: string;
  onClose?: () => void;
  projectId: string;
};

type FormState = {
  category: StoryStateCategory;
  characterId: string;
  details: string;
  isPinned: boolean;
  label: string;
  previousValue: string;
  value: string;
};

const INITIAL_FORM: FormState = {
  category: '위치',
  characterId: '',
  details: '',
  isPinned: false,
  label: '',
  previousValue: '',
  value: '',
};

const CATEGORY_STYLES: Record<StoryStateCategory, string> = {
  '위치': 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  '신체 상태':
    'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  '감정 상태':
    'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  '소지품':
    'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  '기술':
    'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  '관계':
    'border-pink-500/25 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  '비밀':
    'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  '목표':
    'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  '기타': 'border-border bg-muted text-muted-foreground',
};

const fieldClassName =
  'h-10 w-full rounded-xl border border-input bg-card/70 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20';
const textareaClassName = `${fieldClassName} h-auto min-h-20 resize-y py-2 leading-6`;

function sortEntries(entries: StoryStateEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return right.isPinned - left.isPinned;
    if (left.isActive !== right.isActive) return right.isActive - left.isActive;
    return (
      new Date(right.updatedAt ?? 0).getTime() -
      new Date(left.updatedAt ?? 0).getTime()
    );
  });
}

function readError(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error;
  }
  return fallback;
}

export function StoryStatePanel({
  chapterId,
  chapterTitle,
  onClose,
  projectId,
}: StoryStatePanelProps) {
  const [entries, setEntries] = useState<StoryStateEntry[]>([]);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage('');

    Promise.all([
      fetch(`/api/projects/${projectId}/story-state`, {
        signal: controller.signal,
      }),
      fetch(`/api/projects/${projectId}/characters`, {
        signal: controller.signal,
      }),
    ])
      .then(async ([stateResponse, charactersResponse]) => {
        const stateData: unknown = await stateResponse.json();
        const charactersData: unknown = await charactersResponse.json();
        if (!stateResponse.ok) {
          throw new Error(readError(stateData, '상태 메모를 불러오지 못했습니다.'));
        }
        if (!charactersResponse.ok) {
          throw new Error(
            readError(charactersData, '등장인물을 불러오지 못했습니다.')
          );
        }
        setEntries(sortEntries(stateData as StoryStateEntry[]));
        setCharacters(
          (charactersData as CharacterOption[]).map(({ id, name }) => ({
            id,
            name,
          }))
        );
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setMessage(
          error instanceof Error ? error.message : '상태 메모를 불러오지 못했습니다.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId]);

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    return entries.filter((entry) => {
      if (!showHistory && !entry.isActive) return false;
      if (!normalizedQuery) return true;
      return [
        entry.category,
        entry.characterName ?? '작품 전체',
        entry.label,
        entry.value,
        entry.previousValue ?? '',
        entry.details ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(normalizedQuery);
    });
  }, [entries, query, showHistory]);

  const resetForm = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
  };

  const startEditing = (entry: StoryStateEntry) => {
    setEditingId(entry.id);
    setForm({
      category: entry.category,
      characterId: entry.characterId ?? '',
      details: entry.details ?? '',
      isPinned: Boolean(entry.isPinned),
      label: entry.label,
      previousValue: entry.previousValue ?? '',
      value: entry.value,
    });
    setMessage('');
  };

  const submit = async () => {
    if (!form.label.trim() || !form.value.trim()) {
      setMessage('항목 이름과 현재 값을 입력해주세요.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(
        editingId
          ? `/api/projects/${projectId}/story-state/${editingId}`
          : `/api/projects/${projectId}/story-state`,
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            chapterId,
            characterId: form.characterId || null,
            details: form.details.trim() || null,
            label: form.label.trim(),
            previousValue: form.previousValue.trim() || null,
            value: form.value.trim(),
          }),
        }
      );
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(readError(data, '상태 메모를 저장하지 못했습니다.'));
      }
      const saved = data as StoryStateEntry;
      setEntries((current) =>
        sortEntries(
          editingId
            ? current.map((entry) => (entry.id === saved.id ? saved : entry))
            : [saved, ...current]
        )
      );
      resetForm();
      setMessage(editingId ? '상태 메모를 수정했습니다.' : '상태 메모를 추가했습니다.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '상태 메모를 저장하지 못했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const patchEntry = async (
    entry: StoryStateEntry,
    patch: { isActive?: boolean; isPinned?: boolean }
  ) => {
    setBusyId(entry.id);
    setMessage('');
    try {
      const response = await fetch(
        `/api/projects/${projectId}/story-state/${entry.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }
      );
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(readError(data, '상태 메모를 수정하지 못했습니다.'));
      }
      const saved = data as StoryStateEntry;
      setEntries((current) =>
        sortEntries(current.map((item) => (item.id === saved.id ? saved : item)))
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '상태 메모를 수정하지 못했습니다.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const removeEntry = async (entry: StoryStateEntry) => {
    if (!window.confirm(`“${entry.label}” 상태 메모를 영구 삭제할까요?`)) return;
    setBusyId(entry.id);
    setMessage('');
    try {
      const response = await fetch(
        `/api/projects/${projectId}/story-state/${entry.id}`,
        { method: 'DELETE' }
      );
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(readError(data, '상태 메모를 삭제하지 못했습니다.'));
      }
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editingId === entry.id) resetForm();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '상태 메모를 삭제하지 못했습니다.'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <aside
      aria-label="집필 상태 메모"
      className="border-b border-primary/20 bg-[color-mix(in_oklab,var(--card)_92%,var(--primary)_8%)] px-5 py-4 sm:px-7"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="muse-eyebrow flex items-center gap-1.5">
            <CircleDotDashed className="size-3" />
            Canon state ledger
          </p>
          <h3 className="mt-1 font-heading text-base font-semibold">지속 상태 메모</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            위치·상태·소지품·기술을 기록하면 집필 AI와 일관성 검사가
            현재 정전으로 참조합니다.
          </p>
        </div>
        {onClose && (
          <Button
            aria-label="상태 메모 닫기"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        )}
      </div>

      <div className="grid max-h-[34rem] gap-4 overflow-y-auto pr-1 xl:grid-cols-[21rem_minmax(0,1fr)]">
        <form
          className="space-y-3 rounded-2xl border border-border/70 bg-background/55 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">
              {editingId ? '메모 수정' : '변화 기록'}
            </h4>
            <span className="truncate text-[0.68rem] text-muted-foreground">
              기준: {chapterTitle || '현재 챕터'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              분류
              <select
                className={fieldClassName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as StoryStateCategory,
                  }))
                }
                value={form.category}
              >
                {STORY_STATE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              대상
              <select
                className={fieldClassName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    characterId: event.target.value,
                  }))
                }
                value={form.characterId}
              >
                <option value="">작품 전체</option>
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            항목 이름
            <Input
              className="h-10"
              maxLength={120}
              onChange={(event) =>
                setForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="예: 오른팔 부상, 청룡검, 검왕과의 관계"
              value={form.label}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              이전 값 <span className="font-normal opacity-70">(선택)</span>
              <Input
                className="h-10"
                maxLength={1000}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    previousValue: event.target.value,
                  }))
                }
                placeholder="예: 정상"
                value={form.previousValue}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              현재 값
              <Input
                className="h-10"
                maxLength={1000}
                onChange={(event) =>
                  setForm((current) => ({ ...current, value: event.target.value }))
                }
                placeholder="예: 깊은 자상, 검을 들 수 없음"
                value={form.value}
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            작가 참고 사항 <span className="font-normal opacity-70">(선택)</span>
            <textarea
              className={textareaClassName}
              maxLength={4000}
              onChange={(event) =>
                setForm((current) => ({ ...current, details: event.target.value }))
              }
              placeholder="회복 조건, 드러나지 않아야 할 정보, 다음 장면의 주의점…"
              value={form.details}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                checked={form.isPinned}
                className="size-4 rounded border-input accent-primary"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isPinned: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              중요 정보로 고정
            </label>
            <div className="flex gap-2">
              {editingId && (
                <Button onClick={resetForm} size="sm" type="button" variant="outline">
                  취소
                </Button>
              )}
              <Button disabled={saving} size="sm" type="submit">
                {saving ? <Loader2 className="animate-spin" /> : editingId ? <Check /> : <Plus />}
                {saving ? '저장 중' : editingId ? '수정 저장' : '메모 추가'}
              </Button>
            </div>
          </div>
        </form>

        <section className="min-w-0 rounded-2xl border border-border/70 bg-background/55 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-semibold">현재 참조 정보</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                활성 {entries.filter((entry) => entry.isActive).length}개
                {entries.some((entry) => !entry.isActive)
                  ? ` · 기록 종료 ${entries.filter((entry) => !entry.isActive).length}개`
                  : ''}
              </p>
            </div>
            <div className="flex min-w-0 gap-2">
              <label className="relative min-w-0 flex-1 sm:w-52">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="상태 메모 검색"
                  className="h-9 pl-8"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="상태 메모 검색"
                  value={query}
                />
              </label>
              <Button
                aria-pressed={showHistory}
                onClick={() => setShowHistory((current) => !current)}
                size="sm"
                type="button"
                variant={showHistory ? 'secondary' : 'outline'}
              >
                <ArchiveRestore />
                이력
              </Button>
            </div>
          </div>

          {message && (
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              {message}
            </p>
          )}

          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              상태 메모를 불러오는 중입니다.
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 px-4 text-center">
              <CircleDotDashed className="size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">
                {query ? '검색 결과가 없습니다.' : '아직 현재 상태가 없습니다.'}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                집필 중 바뀐 상태를 즉시 기록해 다음 장면의 오류를 줄이세요.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {visibleEntries.map((entry) => {
                const busy = busyId === entry.id;
                return (
                  <article
                    className={cn(
                      'rounded-xl border border-border/70 bg-card/75 p-3 transition-opacity',
                      !entry.isActive && 'opacity-60'
                    )}
                    key={entry.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold',
                              CATEGORY_STYLES[entry.category] ?? CATEGORY_STYLES['기타']
                            )}
                          >
                            {entry.category}
                          </span>
                          {entry.isPinned ? (
                            <span className="flex items-center gap-1 text-[0.65rem] font-medium text-primary">
                              <Pin className="size-3" /> 고정
                            </span>
                          ) : null}
                          {entry.isActive ? null : (
                            <span className="text-[0.65rem] text-muted-foreground">종료된 기록</span>
                          )}
                        </div>
                        <h5 className="mt-1.5 truncate text-sm font-semibold">
                          {entry.characterName ?? '작품 전체'} · {entry.label}
                        </h5>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          aria-label={entry.isPinned ? '고정 해제' : '중요 정보로 고정'}
                          disabled={busy}
                          onClick={() =>
                            void patchEntry(entry, { isPinned: !entry.isPinned })
                          }
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          {entry.isPinned ? <PinOff /> : <Pin />}
                        </Button>
                        <Button
                          aria-label="상태 메모 수정"
                          disabled={busy}
                          onClick={() => startEditing(entry)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          aria-label="상태 메모 삭제"
                          disabled={busy}
                          onClick={() => void removeEntry(entry)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2 text-sm leading-6">
                      {entry.previousValue ? (
                        <p>
                          <span className="text-muted-foreground line-through">
                            {entry.previousValue}
                          </span>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <strong>{entry.value}</strong>
                        </p>
                      ) : (
                        <p className="font-medium">{entry.value}</p>
                      )}
                      {entry.details ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                          {entry.details}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                      <span className="truncate text-[0.65rem] text-muted-foreground">
                        {entry.chapterTitle ?? '시점 미지정'}부터
                      </span>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void patchEntry(entry, { isActive: !entry.isActive })
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {busy ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
                        {entry.isActive ? '기록 종료' : '현재로 복원'}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
