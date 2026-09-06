'use client';

import { useState } from 'react';

import { StructuredFieldSuggestions } from '@/components/ai/structured-field-suggestions';
import { WebResearchSources } from '@/components/ai/web-research-controls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readResearchJson, splitResearchContent } from '@/lib/web-research/content';
import type { WebResearch } from '@/lib/web-research/types';

import { WORLD_CATEGORY_OPTIONS as PRESET_CATEGORIES } from '@/lib/world-categories';

type WorldEntrySuggestion = {
  research?: WebResearch;
  title?: string;
  category?: string;
  content?: string;
  tags?: string[];
};

type SuggestionField = {
  key: string;
  label: string;
  value: string | string[];
};

type WorldEntry = {
  id: string;
  projectId: string;
  tags?: Array<{ id: string; tag: string }>;
  category: string;
  title: string;
  content: string | null;
  researchJson?: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
};

export function WorldEntryForm({
  projectId,
  entry,
  initialCategory = '',
  categoryOptions = PRESET_CATEGORIES,
  onSuccess,
}: {
  projectId: string;
  entry?: WorldEntry;
  initialCategory?: string;
  categoryOptions?: readonly string[];
  onSuccess?: (entry: WorldEntry) => void;
}) {
  const isEditing = !!entry;

  const [title, setTitle] = useState(entry?.title ?? '');
  const [category, setCategory] = useState(entry?.category ?? initialCategory);
  const [customCategory, setCustomCategory] = useState(() => {
    const selected = entry?.category ?? initialCategory;
    if (selected && !categoryOptions.includes(selected)) {
      return selected;
    }
    return '';
  });
  const [content, setContent] = useState(splitResearchContent(entry?.content).content);
  const [research, setResearch] = useState<WebResearch | undefined>(() => readResearchJson(entry?.researchJson) ?? splitResearchContent(entry?.content).research);
  const [tagInput, setTagInput] = useState('');
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<WorldEntrySuggestion | null>(null);

  const effectiveCategory = customCategory.trim() || category;

  const rawSuggestionFields = [
    suggestion?.title ? { key: 'title', label: '제목', value: suggestion.title } : null,
    suggestion?.category ? { key: 'category', label: '카테고리', value: suggestion.category } : null,
    suggestion?.content ? { key: 'content', label: '내용', value: suggestion.content } : null,
    !isEditing && suggestion?.tags && suggestion.tags.length > 0
      ? { key: 'tags', label: '태그', value: suggestion.tags }
      : null,
  ];

  const suggestionFields: SuggestionField[] = rawSuggestionFields.filter(
    (field): field is NonNullable<(typeof rawSuggestionFields)[number]> => field !== null
  );

  const applyCategorySuggestion = (value: string) => {
    if (categoryOptions.includes(value)) {
      setCategory(value);
      setCustomCategory('');
      return;
    }

    setCategory('');
    setCustomCategory(value);
  };

  const mergeTags = (tags: string[]) => {
    setPendingTags((prev) => [...new Set([...prev, ...tags])]);
  };

  const applySuggestionField = (key: string) => {
    switch (key) {
      case 'title':
        if (suggestion?.title) setTitle(suggestion.title);
        return;
      case 'category':
        if (suggestion?.category) applyCategorySuggestion(suggestion.category);
        return;
      case 'content':
        if (suggestion?.content) {
          setContent(splitResearchContent(suggestion.content).content);
          setResearch(suggestion.research ?? splitResearchContent(suggestion.content).research);
        }
        return;
      case 'tags':
        if (suggestion?.tags) mergeTags(suggestion.tags);
        return;
      default:
        return;
    }
  };

  const handleSuggest = async () => {
    if (!suggestionPrompt.trim()) return;

    setIsSuggesting(true);
    setSuggestionError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/world-entries/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: suggestionPrompt.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSuggestionError(data.error ?? '세계관 제안을 가져오지 못했습니다.');
        return;
      }

      setSuggestion(data as WorldEntrySuggestion);
    } catch {
      setSuggestionError('세계관 제안을 가져오지 못했습니다.');
    } finally {
      setIsSuggesting(false);
    }
  };

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
          researchJson: research ? JSON.stringify(research) : null,
        }),
      });

      if (res.ok) {
        const savedEntry = (await res.json()) as WorldEntry;
        let savedTags = entry?.tags ?? [];

        // Add pending tags for new entries
        if (!isEditing && pendingTags.length > 0) {
          const createdTags = await Promise.all(
            pendingTags.map(async (tag) => {
              const tagResponse = await fetch(
                `/api/projects/${projectId}/world-entries/${savedEntry.id}/tags`,
                {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag }),
                }
              );

              if (!tagResponse.ok) return null;
              return (await tagResponse.json()) as { id: string; tag: string };
            })
          );
          savedTags = createdTags.filter(
            (tag): tag is { id: string; tag: string } => tag !== null
          );
        }

        onSuccess?.({ ...savedEntry, tags: savedTags });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {!isEditing && (
        <StructuredFieldSuggestions
          description={suggestionPrompt}
          error={suggestionError}
          fields={suggestionFields}
          isLoading={isSuggesting}
          onApplyAll={() => {
            suggestionFields.forEach((field) => {
              applySuggestionField(field.key);
            });
          }}
          onApplyField={applySuggestionField}
          onDescriptionChange={setSuggestionPrompt}
          onGenerate={handleSuggest}
          title="설명으로 세계관 항목 초안 만들기"
        />
      )}

      <WebResearchSources research={suggestion?.research} />
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
          {categoryOptions.map((cat) => (
            <button
              aria-pressed={category === cat && !customCategory.trim()}
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
        {effectiveCategory === '물건' && (
          <p className="text-xs text-muted-foreground">
            영약·무기·장비·유물·재료를 등록하세요. 공청석유는 물건으로 분류하고 영약 태그를 붙일 수 있습니다.
          </p>
        )}
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
