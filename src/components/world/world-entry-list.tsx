'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { WorldEntryDetail } from '@/components/world/world-entry-detail';
import { WorldEntryForm } from '@/components/world/world-entry-form';
import { WorldSearch } from '@/components/world/world-search';

type WorldEntry = {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  '장소': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  '마법': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  '종족': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  '문화': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  '역사': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  '기술': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  '사건': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

const DEFAULT_CATEGORY_COLOR = 'bg-secondary text-secondary-foreground';

export function WorldEntryList({
  projectId,
  entries,
}: {
  projectId: string;
  entries: WorldEntry[];
}) {
  const router = useRouter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WorldEntry | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagFilteredEntries, setTagFilteredEntries] = useState<WorldEntry[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Get unique categories from entries
  const categories = [...new Set(entries.filter((e) => !deletedIds.has(e.id)).map((e) => e.category))].sort();

  // Filter entries by active category (excluding optimistically deleted)
  const liveEntries = entries.filter((e) => !deletedIds.has(e.id));
  const displayEntries = (tagFilteredEntries?.filter((e) => !deletedIds.has(e.id))) ?? (
    activeCategory
      ? liveEntries.filter((e) => e.category === activeCategory)
      : liveEntries
  );

  // Group entries by category for display
  const groupedEntries = displayEntries.reduce<Record<string, WorldEntry[]>>((acc, entry) => {
    if (!acc[entry.category]) {
      acc[entry.category] = [];
    }
    acc[entry.category].push(entry);
    return acc;
  }, {});

  const handleTagClick = async (tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null);
      setTagFilteredEntries(null);
      return;
    }

    setActiveTag(tag);
    setActiveCategory(null);
    const res = await fetch(
      `/api/projects/${projectId}/world-entries?tag=${encodeURIComponent(tag)}`
    );
    if (res.ok) {
      setTagFilteredEntries(await res.json());
    }
  };

  const handleCategoryFilter = (cat: string | null) => {
    setActiveCategory(cat);
    setActiveTag(null);
    setTagFilteredEntries(null);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">세계관</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            소설 속 세계를 구축하세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowSearch((v) => !v)}
            size="sm"
            type="button"
            variant={showSearch ? 'secondary' : 'outline'}
          >
            검색
          </Button>
          <Dialog onOpenChange={setIsCreateOpen} open={isCreateOpen}>
            <DialogTrigger asChild>
              <Button>새 항목</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>새 항목</DialogTitle>
                <DialogDescription>
                  세계관의 새로운 항목을 추가하세요
                </DialogDescription>
              </DialogHeader>
              <WorldEntryForm
                onSuccess={() => setIsCreateOpen(false)}
                projectId={projectId}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {showSearch && (
        <WorldSearch
          onSelectEntry={(entryId) => {
            const found = entries.find((e) => e.id === entryId);
            if (found) setSelectedEntry(found);
            setShowSearch(false);
          }}
          projectId={projectId}
        />
      )}

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !activeCategory && !activeTag
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-foreground hover:bg-accent'
            }`}
            onClick={() => handleCategoryFilter(null)}
            type="button"
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-accent'
              }`}
              key={cat}
              onClick={() => handleCategoryFilter(cat)}
              type="button"
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Active tag indicator */}
      {activeTag && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">태그 필터:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-foreground bg-foreground px-2.5 py-0.5 text-xs font-medium text-background">
            {activeTag}
            <button
              className="ml-0.5 rounded-full p-0.5 hover:bg-background/20"
              onClick={() => {
                setActiveTag(null);
                setTagFilteredEntries(null);
              }}
              type="button"
            >
              <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {displayEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <p className="text-lg font-medium text-muted-foreground">
            항목이 없습니다
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            &quot;새 항목&quot; 버튼을 눌러 세계관을 구축하세요
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedEntries)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([cat, catEntries]) => (
              <div key={cat}>
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[cat] ?? DEFAULT_CATEGORY_COLOR}`}
                  >
                    {cat}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {catEntries.length}개
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {catEntries.map((entry) => (
                    <EntryCard
                      entry={entry}
                      key={entry.id}
                      onSelect={() => setSelectedEntry(entry)}
                      onTagClick={handleTagClick}
                      projectId={projectId}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {selectedEntry && (
        <EntryDetailDialog
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onDeleted={(id) => setDeletedIds((prev) => new Set([...prev, id]))}
          onTagClick={handleTagClick}
          projectId={projectId}
        />
      )}
    </div>
  );
}

function EntryCard({
  projectId,
  entry,
  onSelect,
  onTagClick,
}: {
  projectId: string;
  entry: WorldEntry;
  onSelect: () => void;
  onTagClick: (tag: string) => void;
}) {
  const [tags, setTags] = useState<{ id: string; tag: string }[]>([]);

  // Fetch tags on mount
  useState(() => {
    fetch(`/api/projects/${projectId}/world-entries/${entry.id}/tags`)
      .then((res) => res.ok ? res.json() : [])
      .then(setTags)
      .catch(() => {});
  });

  return (
    <button
      className="group rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-foreground/20 hover:bg-accent/50"
      onClick={onSelect}
      type="button"
    >
      <h2 className="font-semibold text-card-foreground group-hover:text-foreground">
        {entry.title}
      </h2>
      {entry.content && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {entry.content}
        </p>
      )}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              className="inline-block cursor-pointer rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-muted"
              key={t.id}
              onClick={(e) => {
                e.stopPropagation();
                onTagClick(t.tag);
              }}
            >
              {t.tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function EntryDetailDialog({
  projectId,
  entry,
  onClose,
  onTagClick,
  onDeleted,
}: {
  projectId: string;
  entry: WorldEntry;
  onClose: () => void;
  onTagClick: (tag: string) => void;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<WorldEntry>(entry);

  const refreshEntry = async () => {
    const res = await fetch(
      `/api/projects/${projectId}/world-entries/${entry.id}`
    );
    if (res.ok) {
      const data = (await res.json()) as WorldEntry;
      setCurrentEntry(data);
      router.refresh();
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {isEditing ? (
          <>
            <DialogHeader>
              <DialogTitle>항목 수정</DialogTitle>
              <DialogDescription>
                세계관 항목을 수정하세요
              </DialogDescription>
            </DialogHeader>
            <WorldEntryForm
              entry={currentEntry}
              onSuccess={() => {
                setIsEditing(false);
                refreshEntry();
              }}
              projectId={projectId}
            />
            <div className="flex justify-start">
              <Button
                onClick={() => setIsEditing(false)}
                type="button"
                variant="outline"
              >
                취소
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{currentEntry.title}</DialogTitle>
            </DialogHeader>
            <WorldEntryDetail
              entry={currentEntry}
              onClose={onClose}
              onDeleted={onDeleted}
              onEdit={() => setIsEditing(true)}
              projectId={projectId}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
