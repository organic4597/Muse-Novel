'use client';

import {
  FilePlus2,
  FileText,
  GripVertical,
  ListTree,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  nextProgressiveCount,
  ProgressiveListControls,
} from '@/components/ui/progressive-list-controls';
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from '@/components/ui/sortable';
import { cn } from '@/lib/utils';

interface Chapter {
  id: string;
  projectId: string;
  title: string;
  order: number;
  contentJson: string | null;
  outline: string | null;
  summary: string | null;
  memo: string | null;
  wordCount: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ChapterSidebarProps {
  selectedChapterId: string | null;
  onSelectChapter: (chapter: Chapter | null) => void;
}

export type { Chapter };

const CHAPTER_PAGE_SIZE = 80;

export function ChapterSidebar({
  selectedChapterId,
  onSelectChapter,
}: ChapterSidebarProps) {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [visibleChapterCount, setVisibleChapterCount] = useState(
    CHAPTER_PAGE_SIZE
  );
  const previousChaptersRef = useRef<Chapter[]>([]);
  const selectedChapterStorageKey = `muse-novel-selected-chapter-${projectId}`;

  const selectChapter = (chapter: Chapter) => {
    try {
      localStorage.setItem(selectedChapterStorageKey, chapter.id);
    } catch {
      // Selection persistence is optional.
    }
    onSelectChapter(chapter);
  };

  const restoreChapterSelection = useEffectEvent(() => {
    if (selectedChapterId || chapters.length === 0) return;

    let storedId: string | null = null;
    try {
      storedId = localStorage.getItem(selectedChapterStorageKey);
    } catch {
      // Use the first chapter when storage is unavailable.
    }

    const chapter =
      chapters.find((item) => item.id === storedId) ?? chapters[0];
    if (chapter) onSelectChapter(chapter);
  });

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters`);
      if (res.ok) {
        const data = await res.json();
        setChapters(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  useEffect(() => {
    if (!isLoading) restoreChapterSelection();
  }, [chapters, isLoading, projectId, selectedChapterId]);

  useEffect(() => {
    if (!selectedChapterId) return;
    const selectedIndex = chapters.findIndex(
      (chapter) => chapter.id === selectedChapterId
    );
    if (selectedIndex >= visibleChapterCount) {
      setVisibleChapterCount(selectedIndex + 1);
    }
  }, [chapters, selectedChapterId, visibleChapterCount]);

  const handleCreateChapter = async () => {
    setIsCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '새 챕터' }),
      });

      if (res.ok) {
        const newChapter = await res.json();
        setVisibleChapterCount((current) =>
          Math.max(current, chapters.length + 1)
        );
        setChapters((prev) => [...prev, newChapter]);
        selectChapter(newChapter);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleReorder = async (reorderedVisible: Chapter[]) => {
    const reordered = [
      ...reorderedVisible,
      ...chapters.slice(visibleChapterCount),
    ];
    previousChaptersRef.current = chapters;
    setChapters(reordered);

    const orderedIds = reordered.map((ch) => ch.id);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/chapters/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds }),
        }
      );

      if (!res.ok) {
        setChapters(previousChaptersRef.current);
      }
    } catch {
      setChapters(previousChaptersRef.current);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm('정말로 이 챕터를 삭제하시겠습니까?')) return;
    const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setChapters((prev) => prev.filter((c) => c.id !== chapterId));
      if (selectedChapterId === chapterId) {
        try {
          localStorage.removeItem(selectedChapterStorageKey);
        } catch {
          // Selection persistence is optional.
        }
        onSelectChapter(null);
      }
    }
  };

  const startRename = (chapter: Chapter) => {
    setEditingChapterId(chapter.id);
    setEditingTitle(chapter.title);
  };

  const handleRenameChapter = async (chapter: Chapter) => {
    if (editingChapterId !== chapter.id) return;

    const nextTitle = editingTitle.trim() || '제목 없음';
    setEditingChapterId(null);

    if (nextTitle === chapter.title) return;

    const res = await fetch(
      `/api/projects/${projectId}/chapters/${chapter.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      }
    );

    if (!res.ok) return;

    const updated = (await res.json()) as Chapter;
    setChapters((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  };

  const visibleChapters = chapters.slice(0, visibleChapterCount);

  return (
    <div className="muse-panel overflow-hidden lg:sticky lg:top-[6.5rem]">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-4">
        <div>
          <p className="muse-eyebrow flex items-center gap-1.5">
            <ListTree className="size-3" />
            Manuscript
          </p>
          <h2 className="mt-1.5 font-heading text-base font-semibold">
            원고 목차
            {!isLoading && (
              <span className="ml-2 font-sans text-[0.68rem] font-medium text-muted-foreground">
                {chapters.length}
              </span>
            )}
          </h2>
        </div>
        <Button
          aria-label="새 챕터"
          className="rounded-xl"
          disabled={isCreating}
          onClick={handleCreateChapter}
          size="icon-sm"
          variant="outline"
        >
          <Plus />
        </Button>
      </div>

      <div className="p-3">
        {isLoading ? (
          <div aria-label="챕터를 불러오는 중" className="space-y-2 p-1">
            <div className="h-9 animate-pulse rounded-xl bg-muted" />
            <div className="h-9 animate-pulse rounded-xl bg-muted/70" />
          </div>
        ) : chapters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center">
            <FilePlus2 className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              첫 챕터를 만들어<br />이야기를 시작하세요.
            </p>
            <Button className="mt-4" disabled={isCreating} onClick={handleCreateChapter} size="sm">
              <Plus /> 첫 챕터 만들기
            </Button>
          </div>
        ) : (
          <nav aria-label="챕터 목록">
          <Sortable
            getItemValue={(chapter) => chapter.id}
            onValueChange={handleReorder}
            orientation="vertical"
            value={visibleChapters}
          >
            <SortableContent asChild>
              <ul className="max-h-52 space-y-1 overflow-y-auto pr-1 lg:max-h-[calc(100vh-16rem)]">
                {visibleChapters.map((chapter) => (
                  <SortableItem
                    asChild
                    key={chapter.id}
                    value={chapter.id}
                  >
                    <li className="group/item relative flex items-center rounded-xl">
                      <SortableItemHandle
                        aria-label="드래그하여 순서 변경"
                        className="shrink-0 p-0.5 text-muted-foreground/30 hover:text-muted-foreground"
                      >
                        <GripVertical className="size-3.5" />
                      </SortableItemHandle>
                      {editingChapterId === chapter.id ? (
                        <input
                          aria-label="챕터 제목"
                          autoFocus
                          className="h-9 min-w-0 flex-1 rounded-xl border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
                          onBlur={() => handleRenameChapter(chapter)}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur();
                            }
                            if (event.key === 'Escape') {
                              setEditingChapterId(null);
                            }
                          }}
                          value={editingTitle}
                        />
                      ) : (
                        <button
                          className={cn(
                            'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
                            'hover:bg-accent hover:text-accent-foreground',
                            selectedChapterId === chapter.id
                              ? 'bg-primary/10 text-foreground font-semibold shadow-[inset_3px_0_0_var(--primary)]'
                              : 'text-muted-foreground'
                          )}
                          data-chapter-select
                          onClick={() => selectChapter(chapter)}
                          type="button"
                        >
                          <FileText className="size-3.5 shrink-0 text-primary/75" />
                          <span className="truncate">
                            {chapter.title || '제목 없음'}
                          </span>
                        </button>
                      )}
                      <button
                        aria-label="챕터 이름 변경"
                        className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-100 transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover/item:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          startRename(chapter);
                        }}
                        type="button"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        aria-label="챕터 삭제"
                        className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover/item:opacity-100"
                        onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.id); }}
                        type="button"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  </SortableItem>
                ))}
              </ul>
            </SortableContent>
            <SortableOverlay>
              <div className="rounded-md bg-accent/50 p-2 shadow-sm" />
            </SortableOverlay>
            </Sortable>
            <ProgressiveListControls
              onLoadMore={() =>
                setVisibleChapterCount((current) =>
                  nextProgressiveCount(current, chapters.length, CHAPTER_PAGE_SIZE)
                )
              }
              pageSize={CHAPTER_PAGE_SIZE}
              shown={visibleChapters.length}
              total={chapters.length}
            />
          </nav>
        )}
      </div>
    </div>
  );
}
