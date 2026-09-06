'use client';

import { useState } from 'react';
import { WebResearchSources } from '@/components/ai/web-research-controls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorldEntryLinks } from '@/components/world/world-entry-links';
import { readResearchJson, splitResearchContent } from '@/lib/web-research/content';

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

type Tag = {
  id: string;
  entryId?: string;
  tag: string;
  createdAt?: Date | string | null;
};

export function WorldEntryDetail({
  projectId,
  entry,
  onClose,
  onEdit,
  onDeleted,
  onTagsChange,
}: {
  projectId: string;
  entry: WorldEntry;
  onClose: () => void;
  onEdit: () => void;
  onDeleted?: (id: string) => void;
  onTagsChange?: (tags: Array<{ id: string; tag: string }>) => void;
}) {
  const [tags, setTags] = useState<Tag[]>(entry.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const display = splitResearchContent(entry.content);
  const research = readResearchJson(entry.researchJson) ?? display.research;

  const handleAddTag = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setIsAddingTag(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/world-entries/${entry.id}/tags`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: trimmed }),
        }
      );
      if (res.ok) {
        const createdTag = (await res.json()) as Tag;
        const nextTags = [...tags, createdTag];
        setTagInput('');
        setTags(nextTags);
        onTagsChange?.(nextTags);
      }
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    const res = await fetch(
      `/api/projects/${projectId}/world-entries/${entry.id}/tags`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      }
    );
    if (res.ok) {
      const nextTags = tags.filter((tag) => tag.id !== tagId);
      setTags(nextTags);
      onTagsChange?.(nextTags);
    }
  };

  const handleDelete = async () => {
    if (!confirm('정말로 이 항목을 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/world-entries/${entry.id}`,
        { method: 'DELETE' }
      );

      if (res.ok) {
        onDeleted?.(entry.id);
        onClose();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <span className="inline-block rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {entry.category}
          </span>
        </div>

        {entry.content && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">내용</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 sm:text-base">{display.content}</p>
          </div>
        )}

        <WebResearchSources label="참고 출처" research={research} />

        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">태그</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                key={t.id}
              >
                {t.tag}
                <button
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                  onClick={() => handleDeleteTag(t.id)}
                  type="button"
                >
                  <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2">
            <Input
              disabled={isAddingTag}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="태그를 입력하세요 (Enter 또는 쉼표로 추가)"
              value={tagInput}
            />
          </div>
        </div>

        {/* World entry links (T15) */}
        <WorldEntryLinks entryId={entry.id} projectId={projectId} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button onClick={onEdit} type="button" variant="outline">
          수정
        </Button>
        <Button
          disabled={isDeleting}
          onClick={handleDelete}
          type="button"
          variant="destructive"
        >
          {isDeleting ? '삭제 중...' : '삭제'}
        </Button>
      </div>
    </>
  );
}
