'use client';

import { FileText, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from '@/components/ui/sortable';
import { Button } from '@/components/ui/button';
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
  onSelectChapter: (chapter: Chapter) => void;
}

export type { Chapter };

export function ChapterSidebar({
  selectedChapterId,
  onSelectChapter,
}: ChapterSidebarProps) {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const previousChaptersRef = useRef<Chapter[]>([]);

  const fetchChapters = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/chapters`);
      if (res.ok) {
        const data = await res.json();
        setChapters(data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChapters();
  }, [projectId]);

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
        setChapters((prev) => [...prev, newChapter]);
        onSelectChapter(newChapter);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleReorder = async (reordered: Chapter[]) => {
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
    }
  };

  return (
    <div className="sticky top-20 rounded-lg border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          챕터 목록
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCreateChapter}
          disabled={isCreating}
          aria-label="새 챕터"
        >
          <Plus />
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground/60">불러오는 중...</p>
      ) : chapters.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">
          챕터를 선택하세요
        </p>
      ) : (
        <nav aria-label="챕터 목록">
          <Sortable
            value={chapters}
            onValueChange={handleReorder}
            getItemValue={(chapter) => chapter.id}
            orientation="vertical"
          >
            <SortableContent asChild>
              <ul className="space-y-1">
                {chapters.map((chapter) => (
                  <SortableItem
                    key={chapter.id}
                    value={chapter.id}
                    asChild
                  >
                    <li className="group/item flex items-center">
                      <SortableItemHandle
                        className="shrink-0 p-0.5 text-muted-foreground/40 hover:text-muted-foreground"
                        aria-label="드래그하여 순서 변경"
                      >
                        <GripVertical className="size-3.5" />
                      </SortableItemHandle>
                      <button
                        type="button"
                        onClick={() => onSelectChapter(chapter)}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          'hover:bg-accent hover:text-accent-foreground',
                          selectedChapterId === chapter.id
                            ? 'bg-accent text-accent-foreground font-medium'
                            : 'text-muted-foreground'
                        )}
                      >
                        <FileText className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {chapter.title || '제목 없음'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteChapter(chapter.id); }}
                        className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 hover:text-destructive group-hover/item:opacity-100 transition-opacity"
                        aria-label="챕터 삭제"
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
        </nav>
      )}
    </div>
  );
}
