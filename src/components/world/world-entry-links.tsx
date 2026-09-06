'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type OutgoingLink = {
  id: string;
  targetId: string;
  targetTitle: string;
  createdAt: Date | null;
};

type IncomingLink = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  createdAt: Date | null;
};

type WorldEntry = {
  id: string;
  title: string;
  category: string;
};

export function WorldEntryLinks({
  entryId,
  projectId,
  onNavigate,
}: {
  entryId: string;
  projectId: string;
  onNavigate?: (entryId: string) => void;
}) {
  const [outgoing, setOutgoing] = useState<OutgoingLink[]>([]);
  const [incoming, setIncoming] = useState<IncomingLink[]>([]);
  const [allEntries, setAllEntries] = useState<WorldEntry[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchLinks = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/world-entries/${entryId}/links`
    );
    if (res.ok) {
      const data = await res.json();
      setOutgoing(data.outgoing);
      setIncoming(data.incoming);
    }
  }, [entryId, projectId]);

  const fetchAllEntries = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/world-entries`);
    if (res.ok) {
      const data: WorldEntry[] = await res.json();
      setAllEntries(data.filter((e) => e.id !== entryId));
    }
  }, [entryId, projectId]);

  useEffect(() => {
    fetchLinks();
    fetchAllEntries();
  }, [fetchAllEntries, fetchLinks]);

  const handleAddLink = async () => {
    if (!selectedTargetId) return;

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/world-entries/${entryId}/links`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: selectedTargetId }),
        }
      );
      if (res.ok) {
        setSelectedTargetId('');
        setIsFormOpen(false);
        await fetchLinks();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    const res = await fetch(
      `/api/projects/${projectId}/world-entries/${entryId}/links?linkId=${linkId}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      await fetchLinks();
    }
  };

  // Filter out entries already linked
  const linkedTargetIds = new Set(outgoing.map((l) => l.targetId));
  const availableEntries = allEntries.filter(
    (e) => !linkedTargetIds.has(e.id)
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">관련 항목</h3>
        {!isFormOpen && (
          <Button
            onClick={() => setIsFormOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            링크 추가
          </Button>
        )}
      </div>

      {/* Add link form */}
      {isFormOpen && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <label
            className="text-xs font-medium"
            htmlFor="link-target-select"
          >
            링크할 항목
          </label>
          <select
            className="h-10 w-full rounded-lg border border-input bg-popover px-3 py-2 text-sm text-popover-foreground shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            id="link-target-select"
            onChange={(e) => setSelectedTargetId(e.target.value)}
            value={selectedTargetId}
          >
            <option value="">항목을 선택하세요</option>
            {availableEntries.map((e) => (
              <option key={e.id} value={e.id}>
                [{e.category}] {e.title}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button
              disabled={isSaving}
              onClick={() => {
                setIsFormOpen(false);
                setSelectedTargetId('');
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              취소
            </Button>
            <Button
              disabled={isSaving || !selectedTargetId}
              onClick={handleAddLink}
              size="sm"
              type="button"
            >
              {isSaving ? '추가 중...' : '추가'}
            </Button>
          </div>
        </div>
      )}

      {/* Outgoing links */}
      {outgoing.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            이 항목이 참조하는 항목
          </h4>
          <div className="space-y-1">
            {outgoing.map((link) => (
              <div
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                key={link.id}
              >
                <button
                  className="text-sm font-medium text-foreground hover:underline"
                  onClick={() => onNavigate?.(link.targetId)}
                  type="button"
                >
                  {link.targetTitle}
                </button>
                <button
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => handleDeleteLink(link.id)}
                  title="링크 삭제"
                  type="button"
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M18 6 6 18M6 6l12 12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incoming backlinks */}
      {incoming.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            이 항목을 참조하는 항목
          </h4>
          <div className="space-y-1">
            {incoming.map((link) => (
              <div
                className="flex items-center rounded-md border border-dashed border-border px-3 py-2"
                key={link.id}
              >
                <button
                  className="text-sm font-medium text-foreground hover:underline"
                  onClick={() => onNavigate?.(link.sourceId)}
                  type="button"
                >
                  {link.sourceTitle}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {outgoing.length === 0 && incoming.length === 0 && !isFormOpen && (
        <p className="text-sm text-muted-foreground">
          연결된 항목이 없습니다.
        </p>
      )}
    </div>
  );
}
