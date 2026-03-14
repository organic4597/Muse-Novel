'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorldEntryLinks } from '@/components/world/world-entry-links';

type WorldEntry = {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type Tag = {
  id: string;
  entryId: string;
  tag: string;
  createdAt: Date | null;
};

export function WorldEntryDetail({
  projectId,
  entry,
  onClose,
  onEdit,
  onDeleted,
}: {
  projectId: string;
  entry: WorldEntry;
  onClose: () => void;
  onEdit: () => void;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);

  const fetchTags = async () => {
    const res = await fetch(
      `/api/projects/${projectId}/world-entries/${entry.id}/tags`
    );
    if (res.ok) {
      setTags(await res.json());
    }
  };

  useEffect(() => {
    fetchTags();
  }, [entry.id]);

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
        setTagInput('');
        await fetchTags();
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
      await fetchTags();
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
        router.refresh();
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
            <p className="mt-1 whitespace-pre-wrap text-sm">{entry.content}</p>
          </div>
        )}

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
