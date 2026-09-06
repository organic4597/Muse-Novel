'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  WritingKnowledgeClientSearchOptions,
  WritingKnowledgeClientSearchResult,
  WritingKnowledgeIndexDocument,
  WritingKnowledgeWorkerRequest,
  WritingKnowledgeWorkerResponse,
} from '@/lib/knowledge/writing-knowledge-client';

type PendingRequest = {
  reject: (reason: Error) => void;
  resolve: (response: WritingKnowledgeWorkerResponse) => void;
};

export type WritingKnowledgeWorkerStatus = 'loading' | 'ready' | 'error';

export type UseWritingKnowledgeWorkerResult = {
  error: string | null;
  indexSize: number;
  indexVersion: string | null;
  isStale: boolean;
  refresh: () => Promise<void>;
  resolveDocuments: (
    ids: readonly string[],
    signal?: AbortSignal
  ) => Promise<WritingKnowledgeIndexDocument[]>;
  search: (
    query: string,
    options?: WritingKnowledgeClientSearchOptions
  ) => Promise<WritingKnowledgeClientSearchResult>;
  status: WritingKnowledgeWorkerStatus;
};

const DEFAULT_ENDPOINT = '/api/writing-knowledge?mode=index';

function isVerifiedDocument(value: unknown): value is WritingKnowledgeIndexDocument {
  if (!value || typeof value !== 'object') return false;
  const document = value as Partial<WritingKnowledgeIndexDocument>;
  return (
    typeof document.category === 'string' &&
    typeof document.content === 'string' &&
    typeof document.id === 'string' &&
    typeof document.summary === 'string' &&
    Array.isArray(document.tags) &&
    typeof document.title === 'string'
  );
}

function getDocumentEndpoint(indexEndpoint: string, id: string) {
  const url = new URL(indexEndpoint, window.location.origin);
  url.search = '';
  url.searchParams.set('id', id);
  return url.toString();
}

export function useWritingKnowledgeWorker({
  endpoint = DEFAULT_ENDPOINT,
}: {
  endpoint?: string;
} = {}): UseWritingKnowledgeWorkerResult {
  const [status, setStatus] = useState<WritingKnowledgeWorkerStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [indexSize, setIndexSize] = useState(0);
  const [indexVersion, setIndexVersion] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestSequenceRef = useRef(0);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const readyRef = useRef(false);

  const nextRequestId = useCallback(() => {
    requestSequenceRef.current += 1;
    return `writing-knowledge-${requestSequenceRef.current}`;
  }, []);

  const requestWorker = useCallback(
    (message: WritingKnowledgeWorkerRequest) =>
      new Promise<WritingKnowledgeWorkerResponse>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error('창작 지식 검색 Worker가 준비되지 않았습니다.'));
          return;
        }
        pendingRef.current.set(message.requestId, { reject, resolve });
        worker.postMessage(message);
      }),
    []
  );

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setError('현재 브라우저는 백그라운 창작 지식 검색을 지원하지 않습니다.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError(null);
    readyRef.current = false;
    const worker = new Worker(
      new URL('../workers/writing-knowledge.worker.ts', import.meta.url),
      { name: 'muse-writing-knowledge', type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WritingKnowledgeWorkerResponse>) => {
      const response = event.data;
      if (response.type === 'index-ready') {
        readyRef.current = true;
        setStatus('ready');
        setError(null);
        setIndexSize(response.total);
        setIndexVersion(response.version);
        setIsStale(response.stale);
      } else if (response.type === 'error') {
        setError(response.message);
        if (!readyRef.current) setStatus('error');
      }

      const pending = pendingRef.current.get(response.requestId);
      if (!pending) return;
      pendingRef.current.delete(response.requestId);
      if (response.type === 'error') {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response);
      }
    };
    worker.onerror = () => {
      const workerError = new Error('창작 지식 검색 Worker가 예기치 않게 종료됐습니다.');
      setError(workerError.message);
      setStatus('error');
      for (const pending of pendingRef.current.values()) {
        pending.reject(workerError);
      }
      pendingRef.current.clear();
    };

    worker.postMessage({
      endpoint,
      requestId: nextRequestId(),
      type: 'initialize',
    } satisfies WritingKnowledgeWorkerRequest);

    return () => {
      worker.terminate();
      workerRef.current = null;
      const disposedError = new Error('창작 지식 검색이 종료됐습니다.');
      for (const pending of pendingRef.current.values()) {
        pending.reject(disposedError);
      }
      pendingRef.current.clear();
    };
  }, [endpoint, nextRequestId]);

  const search = useCallback(
    async (
      query: string,
      options?: WritingKnowledgeClientSearchOptions
    ): Promise<WritingKnowledgeClientSearchResult> => {
      const response = await requestWorker({
        options,
        query,
        requestId: nextRequestId(),
        type: 'search',
      });
      if (response.type !== 'search-results') {
        throw new Error('창작 지식 검색 응답 형식이 올바르지 않습니다.');
      }
      return {
        matches: response.matches,
        queries: response.queries,
        version: response.version,
      };
    },
    [nextRequestId, requestWorker]
  );

  const refresh = useCallback(async () => {
    const response = await requestWorker({
      endpoint,
      requestId: nextRequestId(),
      type: 'refresh',
    });
    if (response.type !== 'index-ready') {
      throw new Error('창작 지식 인덱스 갱신 응답이 올바르지 않습니다.');
    }
  }, [endpoint, nextRequestId, requestWorker]);

  const resolveDocuments = useCallback(
    async (ids: readonly string[], signal?: AbortSignal) => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 10);
      const documents = await Promise.all(
        uniqueIds.map(async (id) => {
          const response = await fetch(getDocumentEndpoint(endpoint, id), {
            cache: 'no-store',
            signal,
          });
          if (response.status === 404) return null;
          if (!response.ok) {
            throw new Error(`창작 지식 문서를 검증하지 못했습니다. (${response.status})`);
          }
          const document: unknown = await response.json();
          return isVerifiedDocument(document) && document.id === id
            ? document
            : null;
        })
      );
      return documents.filter(
        (document): document is WritingKnowledgeIndexDocument => Boolean(document)
      );
    },
    [endpoint]
  );

  return {
    error,
    indexSize,
    indexVersion,
    isStale,
    refresh,
    resolveDocuments,
    search,
    status,
  };
}
