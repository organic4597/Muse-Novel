import {
  isWritingKnowledgeIndexPayload,
  type PreparedWritingKnowledgeIndex,
  prepareWritingKnowledgeIndex,
  searchPreparedWritingKnowledge,
  type WritingKnowledgeIndexPayload,
  type WritingKnowledgeWorkerRequest,
  type WritingKnowledgeWorkerResponse,
} from '@/lib/knowledge/writing-knowledge-client';

type CacheRecord = {
  cachedAt: number;
  endpoint: string;
  etag: string;
  payload: WritingKnowledgeIndexPayload;
};

const DATABASE_NAME = 'muse-novel-writing-knowledge';
const DATABASE_VERSION = 1;
const INDEX_STORE = 'indexes';
const DEFAULT_ENDPOINT = '/api/writing-knowledge?mode=index';

const workerScope = self as unknown as {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<WritingKnowledgeWorkerRequest>) => void
  ) => void;
  postMessage: (message: WritingKnowledgeWorkerResponse) => void;
};

let activeEndpoint = DEFAULT_ENDPOINT;
let activeRecord: CacheRecord | null = null;
let preparedIndex: PreparedWritingKnowledgeIndex | null = null;
let initialization: Promise<void> | null = null;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(INDEX_STORE)) {
        request.result.createObjectStore(INDEX_STORE, { keyPath: 'endpoint' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB를 열 수 없습니다.'));
  });
}

async function readCachedIndex(endpoint: string) {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  return new Promise<CacheRecord | null>((resolve, reject) => {
    const transaction = database.transaction(INDEX_STORE, 'readonly');
    const request = transaction.objectStore(INDEX_STORE).get(endpoint);
    request.onsuccess = () => {
      const record = request.result as CacheRecord | undefined;
      resolve(
        record && isWritingKnowledgeIndexPayload(record.payload) ? record : null
      );
    };
    request.onerror = () => reject(request.error ?? new Error('캐시를 읽을 수 없습니다.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function writeCachedIndex(record: CacheRecord) {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INDEX_STORE, 'readwrite');
    transaction.objectStore(INDEX_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('캐시를 저장할 수 없습니다.'));
  }).finally(() => database.close());
}

function activate(record: CacheRecord) {
  activeEndpoint = record.endpoint;
  activeRecord = record;
  preparedIndex = prepareWritingKnowledgeIndex(record.payload);
}

function announceReady(
  requestId: string,
  source: 'cache' | 'network',
  stale: boolean
) {
  if (!activeRecord) return;
  workerScope.postMessage({
    requestId,
    source,
    stale,
    total: activeRecord.payload.total,
    type: 'index-ready',
    version: activeRecord.payload.version,
  });
}

async function fetchRemoteIndex(endpoint: string, cached: CacheRecord | null) {
  const response = await fetch(endpoint, {
    cache: 'no-cache',
    headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined,
  });

  if (response.status === 304 && cached) {
    const refreshed = { ...cached, cachedAt: Date.now() };
    await writeCachedIndex(refreshed).catch(() => undefined);
    return { record: refreshed, source: 'cache' as const };
  }
  if (!response.ok) {
    throw new Error(`창작 지식 인덱스를 불러오지 못했습니다. (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!isWritingKnowledgeIndexPayload(payload)) {
    throw new Error('창작 지식 인덱스 형식이 올바르지 않습니다.');
  }
  const record: CacheRecord = {
    cachedAt: Date.now(),
    endpoint,
    etag: response.headers.get('etag') ?? `"${payload.version}"`,
    payload,
  };
  await writeCachedIndex(record).catch(() => undefined);
  return { record, source: 'network' as const };
}

async function initializeIndex(endpoint: string, requestId: string) {
  activeEndpoint = endpoint;
  const cached = await readCachedIndex(endpoint).catch(() => null);
  if (cached) {
    activate(cached);
    announceReady(requestId, 'cache', true);
  }

  try {
    const remote = await fetchRemoteIndex(endpoint, cached);
    activate(remote.record);
    announceReady(requestId, remote.source, false);
  } catch (error) {
    if (!cached) throw error;
    announceReady(requestId, 'cache', true);
  }
}

async function refreshIndex(endpoint: string, requestId: string) {
  const cached = activeEndpoint === endpoint ? activeRecord : null;
  const remote = await fetchRemoteIndex(endpoint, cached);
  activate(remote.record);
  announceReady(requestId, remote.source, false);
}

function reportError(requestId: string, error: unknown) {
  workerScope.postMessage({
    message:
      error instanceof Error ? error.message : '창작 지식 검색 중 오류가 발생했습니다.',
    requestId,
    type: 'error',
  });
}

workerScope.addEventListener('message', (event) => {
  const message = event.data;
  if (message.type === 'initialize') {
    initialization = initializeIndex(message.endpoint, message.requestId);
    void initialization.catch((error) => reportError(message.requestId, error));
    return;
  }

  if (message.type === 'refresh') {
    const previousInitialization = initialization;
    const refresh = async () => {
      await previousInitialization?.catch(() => undefined);
      await refreshIndex(message.endpoint, message.requestId);
    };
    initialization = refresh();
    void initialization.catch((error) => reportError(message.requestId, error));
    return;
  }

  if (message.type !== 'search') return;
  const search = async () => {
    await initialization;
    if (!preparedIndex) {
      throw new Error('창작 지식 인덱스가 아직 준비되지 않았습니다.');
    }
    const result = searchPreparedWritingKnowledge(
      preparedIndex,
      message.query,
      message.options
    );
    workerScope.postMessage({
      ...result,
      requestId: message.requestId,
      type: 'search-results',
    });
  };
  void search().catch((error) => reportError(message.requestId, error));
});
