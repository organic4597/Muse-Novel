'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PRESET_CATEGORIES = ['장소', '마법', '종족', '문화', '역사', '기술', '사건'] as const;

type WorldEntry = {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export function WorldEntryForm({
  projectId,
  entry,
  onSuccess,
}: {
  projectId: string;
  entry?: WorldEntry;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEditing = !!entry;

  const [title, setTitle] = useState(entry?.title ?? '');
  const [category, setCategory] = useState(entry?.category ?? '');
  const [customCategory, setCustomCategory] = useState(() => {
    if (entry?.category && !PRESET_CATEGORIES.includes(entry.category as typeof PRESET_CATEGORIES[number])) {
      return entry.category;
    }
    return '';
  });
  const [content, setContent] = useState(entry?.content ?? '');
  const [tagInput, setTagInput] = useState('');
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const effectiveCategory = customCategory.trim() || category;

  const handleAddTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !pendingTags.includes(trimmed)) {
      setPendingTags([...pendingTags, trimmed]);
    }
    setTagInput('');
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setPendingTags(pendingTags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !effectiveCategory) return;

    setIsLoading(true);
    try {
      const url = isEditing
        ? `/api/projects/${projectId}/world-entries/${entry.id}`
        : `/api/projects/${projectId}/world-entries`;

      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category: effectiveCategory,
          content: content.trim() || null,
        }),
      });

      if (res.ok) {
        const savedEntry = await res.json();

        // Add pending tags for new entries
        if (!isEditing && pendingTags.length > 0) {
          await Promise.all(
            pendingTags.map((tag) =>
              fetch(`/api/projects/${projectId}/world-entries/${savedEntry.id}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag }),
              })
            )
          );
        }

        router.refresh();
        onSuccess?.();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="we-title">
          제목 <span className="text-destructive">*</span>
        </label>
        <Input
          autoFocus
          disabled={isLoading}
          id="we-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="항목 제목"
          required
          value={title}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="we-category">
          카테고리 <span className="text-destructive">*</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_CATEGORIES.map((cat) => (
            <button
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                category === cat && !customCategory.trim()
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-accent'
              }`}
              disabled={isLoading}
              key={cat}
              onClick={() => {
                setCategory(cat);
                setCustomCategory('');
              }}
              type="button"
            >
              {cat}
            </button>
          ))}
        </div>
        <Input
          disabled={isLoading}
          id="we-category"
          onChange={(e) => {
            setCustomCategory(e.target.value);
            if (e.target.value.trim()) {
              setCategory('');
            }
          }}
          placeholder="또는 직접 입력"
          value={customCategory}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="we-content">
          내용
        </label>
        <textarea
          className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          disabled={isLoading}
          id="we-content"
          onChange={(e) => setContent(e.target.value)}
          placeholder="세계관 항목에 대한 상세 내용을 작성하세요"
          value={content}
        />
      </div>

      {!isEditing && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="we-tags">
            태그
          </label>
          <div className="flex flex-wrap gap-1.5">
            {pendingTags.map((tag) => (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                key={tag}
              >
                {tag}
                <button
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                  onClick={() => handleRemoveTag(tag)}
                  type="button"
                >
                  <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
          <Input
            disabled={isLoading}
            id="we-tags"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="태그를 입력하세요 (Enter 또는 쉼표로 추가)"
            value={tagInput}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button disabled={isLoading || !title.trim() || !effectiveCategory} type="submit">
          {isLoading ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}
