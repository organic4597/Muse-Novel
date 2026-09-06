'use client';

import { useCallback, useEffect, useRef } from 'react';

import {
  type EditorContentWorkerRequest,
  type EditorContentWorkerResponse,
  type ProcessedEditorContent,
  processEditorContent,
} from './editor-content-worker-core';

interface EditorContentJob extends EditorContentWorkerRequest {
  emitChange: boolean;
}

interface UseEditorContentWorkerOptions {
  onError?: (error: Error) => void;
  onResult: (result: ProcessedEditorContent, emitChange: boolean) => void;
}

export interface EditorContentProcessor {
  flush: () => Promise<void>;
  processValue: (value: unknown, options?: { emitChange?: boolean }) => void;
}

type ProcessingMode = 'starting' | 'worker' | 'fallback' | 'disposed';

/**
 * Serializes Plate values and computes text statistics away from the UI thread.
 * Only one job plus the newest pending value are retained, preventing a fast
 * typist from filling the worker queue with already-obsolete document snapshots.
 */
export function useEditorContentWorker({
  onError,
  onResult,
}: UseEditorContentWorkerOptions): EditorContentProcessor {
  const callbacksRef = useRef({ onError, onResult });
  callbacksRef.current = { onError, onResult };

  const activeJobRef = useRef<EditorContentJob | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushResolversRef = useRef<Array<() => void>>([]);
  const modeRef = useRef<ProcessingMode>('starting');
  const nextRequestIdRef = useRef(0);
  const pendingJobRef = useRef<EditorContentJob | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const drainRef = useRef<() => void>(() => undefined);

  const resolveFlushes = useCallback(() => {
    if (activeJobRef.current || pendingJobRef.current) return;

    const resolvers = flushResolversRef.current.splice(0);
    for (const resolve of resolvers) resolve();
  }, []);

  const finishJob = useCallback(
    (job: EditorContentJob, result: ProcessedEditorContent) => {
      callbacksRef.current.onResult(result, job.emitChange);
      activeJobRef.current = null;
      drainRef.current();
      resolveFlushes();
    },
    [resolveFlushes]
  );

  const processOnMainThread = useCallback(
    (job: EditorContentJob) => {
      fallbackTimerRef.current = setTimeout(() => {
        fallbackTimerRef.current = null;

        try {
          finishJob(job, processEditorContent(job.value));
        } catch (error) {
          activeJobRef.current = null;
          callbacksRef.current.onError?.(
            error instanceof Error ? error : new Error('편집기 내용을 처리하지 못했습니다.')
          );
          drainRef.current();
          resolveFlushes();
        }
      }, 0);
    },
    [finishJob, resolveFlushes]
  );

  drainRef.current = () => {
    if (activeJobRef.current || !pendingJobRef.current) {
      resolveFlushes();
      return;
    }

    const job = pendingJobRef.current;
    pendingJobRef.current = null;
    activeJobRef.current = job;

    if (modeRef.current !== 'worker' || !workerRef.current) {
      processOnMainThread(job);
      return;
    }

    try {
      workerRef.current.postMessage({
        requestId: job.requestId,
        value: job.value,
      } satisfies EditorContentWorkerRequest);
    } catch {
      workerRef.current.terminate();
      workerRef.current = null;
      modeRef.current = 'fallback';
      processOnMainThread(job);
    }
  };

  useEffect(() => {
    modeRef.current = 'starting';

    if (typeof Worker === 'undefined') {
      modeRef.current = 'fallback';
      drainRef.current();
    } else {
      try {
        const worker = new Worker(new URL('./editor-content.worker.ts', import.meta.url), {
          name: 'muse-editor-content',
          type: 'module',
        });

        worker.onmessage = (event: MessageEvent<EditorContentWorkerResponse>) => {
          const activeJob = activeJobRef.current;
          const response = event.data;

          if (!activeJob || response.requestId !== activeJob.requestId) return;

          if (response.success) {
            finishJob(activeJob, response.result);
            return;
          }

          callbacksRef.current.onError?.(new Error(response.error));
          activeJobRef.current = null;
          drainRef.current();
          resolveFlushes();
        };

        worker.onerror = (event) => {
          event.preventDefault();

          const unfinishedJob = pendingJobRef.current ?? activeJobRef.current;
          activeJobRef.current = null;
          pendingJobRef.current = unfinishedJob;
          worker.terminate();
          workerRef.current = null;
          modeRef.current = 'fallback';
          drainRef.current();
        };

        workerRef.current = worker;
        modeRef.current = 'worker';
        drainRef.current();
      } catch {
        modeRef.current = 'fallback';
        drainRef.current();
      }
    }

    return () => {
      modeRef.current = 'disposed';
      workerRef.current?.terminate();
      workerRef.current = null;

      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      // Preserve unfinished work across React Strict Mode's effect replay.
      pendingJobRef.current = pendingJobRef.current ?? activeJobRef.current;
      activeJobRef.current = null;
    };
  }, [finishJob, resolveFlushes]);

  const processValue = useCallback(
    (value: unknown, options?: { emitChange?: boolean }) => {
      pendingJobRef.current = {
        emitChange: options?.emitChange ?? true,
        requestId: ++nextRequestIdRef.current,
        value,
      };
      drainRef.current();
    },
    []
  );

  const flush = useCallback(() => {
    if (!activeJobRef.current && !pendingJobRef.current) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      flushResolversRef.current.push(resolve);
      drainRef.current();
    });
  }, []);

  return { flush, processValue };
}
