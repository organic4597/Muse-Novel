'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

type SaveStatus = 'idle' | 'saving' | 'error' | 'saved';

interface UseAutoSaveOptions {
  projectId: string;
  chapterId: string;
  enabled?: boolean;
}

interface UseAutoSaveResult {
  status: SaveStatus;
  save: (content: string) => void;
  flush: () => void;
}

export function useAutoSave({
  projectId,
  chapterId,
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSave = async (content: string) => {
    if (!enabled) return;

    setStatus('saving');

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/content`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentJson: content }),
        }
      );

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }

      setStatus('saved');

      // Clear any existing reset timer
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }

      // Reset to idle after 3 seconds
      resetTimerRef.current = setTimeout(() => {
        setStatus('idle');
      }, 3000);
    } catch {
      setStatus('error');
      localStorage.setItem(`muse-novel-backup-${chapterId}`, content);
    }
  };

  const debouncedSave = useDebouncedCallback(
    (content: string) => {
      void performSave(content);
    },
    2500
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      debouncedSave.flush();
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (content: string) => {
    if (!enabled) return;
    debouncedSave(content);
  };

  const flush = () => {
    debouncedSave.flush();
  };

  return { status, save, flush };
}
