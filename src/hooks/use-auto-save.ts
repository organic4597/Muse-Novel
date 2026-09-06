'use client';

import { useEffect, useRef, useState } from 'react';

import {
  clearDraftOutboxIfMatching,
  type DraftOutboxRecord,
  draftOutboxId,
  putDraftOutbox,
  readDraftOutbox,
  storeDraftOutboxRecoveryCopy,
} from '@/lib/client/draft-outbox';

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
  retry: () => void;
}

interface PendingDraft {
  record: DraftOutboxRecord;
  persisted: Promise<unknown> | null;
  revision: number;
}

const LOCAL_PERSIST_DELAY_MS = 250;
const SERVER_SYNC_DELAY_MS = 5000;
const SAVED_STATUS_DURATION_MS = 3000;

export function useAutoSave({
  projectId,
  chapterId,
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveResult {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );
  const persistenceTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>()
  );
  const latestDraftsRef = useRef(new Map<string, PendingDraft>());
  const queuedKeysRef = useRef(new Set<string>());
  const keepaliveKeysRef = useRef(new Set<string>());
  const isSyncingRef = useRef(false);
  const isMountedRef = useRef(true);
  const revisionRef = useRef(0);
  const currentKey = draftOutboxId(projectId, chapterId);
  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;

  const setCurrentStatus = (key: string, nextStatus: SaveStatus) => {
    if (isMountedRef.current && currentKeyRef.current === key) {
      setStatus(nextStatus);
    }
  };

  const markSaved = (key: string) => {
    setCurrentStatus(key, 'saved');
    if (currentKeyRef.current !== key || !isMountedRef.current) return;

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setCurrentStatus(key, 'idle');
    }, SAVED_STATUS_DURATION_MS);
  };

  const clearPersistenceTimer = (key: string) => {
    const timer = persistenceTimersRef.current.get(key);
    if (timer) clearTimeout(timer);
    persistenceTimersRef.current.delete(key);
  };

  const clearSyncTimer = (key: string) => {
    const timer = syncTimersRef.current.get(key);
    if (timer) clearTimeout(timer);
    syncTimersRef.current.delete(key);
  };

  const persistDraft = (
    key: string,
    { recoveryCopy = false }: { recoveryCopy?: boolean } = {}
  ): Promise<unknown> | null => {
    clearPersistenceTimer(key);
    const draft = latestDraftsRef.current.get(key);
    if (!draft) return null;

    if (recoveryCopy) {
      storeDraftOutboxRecoveryCopy(draft.record);
    }

    if (!draft.persisted) {
      draft.persisted = putDraftOutbox(draft.record);
    }
    return draft.persisted;
  };

  const persistLatestDraft = async (
    key: string
  ): Promise<PendingDraft | null> => {
    while (true) {
      const draft = latestDraftsRef.current.get(key);
      if (!draft) return null;

      await persistDraft(key);
      const latest = latestDraftsRef.current.get(key);
      if (latest?.revision === draft.revision) return draft;
    }
  };

  const drainSyncQueue = async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      while (queuedKeysRef.current.size > 0) {
        const key = queuedKeysRef.current.values().next().value as
          | string
          | undefined;
        if (!key) break;
        queuedKeysRef.current.delete(key);

        const draft = await persistLatestDraft(key);
        if (!draft) {
          keepaliveKeysRef.current.delete(key);
          continue;
        }

        if (resetTimerRef.current && currentKeyRef.current === key) {
          clearTimeout(resetTimerRef.current);
          resetTimerRef.current = null;
        }
        setCurrentStatus(key, 'saving');

        try {
          const useKeepalive = keepaliveKeysRef.current.delete(key);
          const response = await fetch(
            `/api/projects/${draft.record.projectId}/chapters/${draft.record.chapterId}/content`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contentJson: draft.record.content }),
              ...(useKeepalive ? { keepalive: true } : {}),
            }
          );

          if (!response.ok) {
            throw new Error(`Save failed: ${response.status}`);
          }

          const latest = latestDraftsRef.current.get(key);
          if (latest?.revision === draft.revision) {
            clearSyncTimer(key);
            await clearDraftOutboxIfMatching(
              draft.record.projectId,
              draft.record.chapterId,
              draft.record.content
            );
            latestDraftsRef.current.delete(key);
            markSaved(key);
          } else {
            // A newer local edit is waiting for its own debounce window. Do not
            // report the older request as the final saved state.
            setCurrentStatus(key, 'idle');
          }
        } catch {
          const latest = latestDraftsRef.current.get(key);
          if (latest?.revision === draft.revision) {
            setCurrentStatus(key, 'error');
          }
        }
      }
    } finally {
      isSyncingRef.current = false;
      if (queuedKeysRef.current.size > 0) {
        void drainSyncQueue();
      }
    }
  };

  const requestSync = (key: string, keepalive = false) => {
    if (keepalive) keepaliveKeysRef.current.add(key);
    queuedKeysRef.current.add(key);
    void drainSyncQueue();
  };

  const schedulePersistence = (key: string) => {
    clearPersistenceTimer(key);
    persistenceTimersRef.current.set(
      key,
      setTimeout(() => {
        persistenceTimersRef.current.delete(key);
        void persistDraft(key);
      }, LOCAL_PERSIST_DELAY_MS)
    );
  };

  const scheduleSync = (key: string) => {
    clearSyncTimer(key);
    syncTimersRef.current.set(
      key,
      setTimeout(() => {
        syncTimersRef.current.delete(key);
        requestSync(key);
      }, SERVER_SYNC_DELAY_MS)
    );
  };

  const flushKey = (
    key: string,
    {
      keepalive = false,
      recoveryCopy = false,
    }: { keepalive?: boolean; recoveryCopy?: boolean } = {}
  ) => {
    clearSyncTimer(key);
    void persistDraft(key, { recoveryCopy });
    requestSync(key, keepalive);
  };

  const flushAll = (
    options: { keepalive?: boolean; recoveryCopy?: boolean } = {}
  ) => {
    for (const key of latestDraftsRef.current.keys()) {
      flushKey(key, options);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    const handlePageHide = () => {
      flushAll({ keepalive: true, recoveryCopy: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushAll({ recoveryCopy: true });
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushAll({ keepalive: true, recoveryCopy: true });
      isMountedRef.current = false;
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!(enabled && projectId && chapterId)) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    const key = draftOutboxId(projectId, chapterId);

    void readDraftOutbox(projectId, chapterId).then((record) => {
      if (cancelled || !record || latestDraftsRef.current.has(key)) return;

      latestDraftsRef.current.set(key, {
        record,
        persisted: Promise.resolve(),
        revision: ++revisionRef.current,
      });
      setCurrentStatus(key, 'error');
      scheduleSync(key);
    });

    return () => {
      cancelled = true;
      flushKey(key);
    };
    // Storage recovery must run only when the active chapter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, enabled, projectId]);

  useEffect(() => {
    if (!(enabled && projectId && chapterId)) return;

    const handleOnline = () => {
      const key = draftOutboxId(projectId, chapterId);
      if (latestDraftsRef.current.has(key)) {
        flushKey(key);
        return;
      }

      void readDraftOutbox(projectId, chapterId).then((record) => {
        if (!record || latestDraftsRef.current.has(key)) return;
        latestDraftsRef.current.set(key, {
          record,
          persisted: Promise.resolve(),
          revision: ++revisionRef.current,
        });
        requestSync(key);
      });
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, enabled, projectId]);

  const save = (content: string) => {
    if (!(enabled && projectId && chapterId)) return;

    const key = draftOutboxId(projectId, chapterId);
    const record: DraftOutboxRecord = {
      id: key,
      projectId,
      chapterId,
      content,
      updatedAt: Date.now(),
    };
    latestDraftsRef.current.set(key, {
      record,
      persisted: null,
      revision: ++revisionRef.current,
    });
    schedulePersistence(key);
    scheduleSync(key);
  };

  const flush = () => {
    if (!(enabled && projectId && chapterId)) return;
    const key = draftOutboxId(projectId, chapterId);
    flushKey(key);
  };

  const retry = () => {
    if (!(enabled && projectId && chapterId)) return;
    const key = draftOutboxId(projectId, chapterId);

    if (latestDraftsRef.current.has(key)) {
      flushKey(key);
      return;
    }

    void readDraftOutbox(projectId, chapterId).then((record) => {
      if (!record || latestDraftsRef.current.has(key)) return;
      latestDraftsRef.current.set(key, {
        record,
        persisted: Promise.resolve(),
        revision: ++revisionRef.current,
      });
      requestSync(key);
    });
  };

  return { status, save, flush, retry };
}
