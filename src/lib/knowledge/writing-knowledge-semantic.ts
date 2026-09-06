import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { DB } from '@/lib/db';
import {
  createEmbeddings,
  createQueryEmbedding,
  type EmbeddingServiceConfig,
  getEmbeddingFingerprintPrefix,
  resolveEmbeddingServiceConfig,
} from '@/lib/memory/embedding-client';

import {
  buildWritingKnowledgeContextFromDocuments,
  loadWritingKnowledge,
  runWritingKnowledgeAgent,
  type WritingKnowledgeAgentResult,
  type WritingKnowledgeDocument,
} from './writing-knowledge';

const DOCUMENT_EMBEDDING_BATCH_SIZE = 24;
const MAX_DOCUMENT_VECTOR_CACHE_ENTRIES = 4096;
const MAX_CORPUS_CACHE_ENTRIES = 8;
const MAX_SIDECAR_BYTES = 32 * 1024 * 1024;
const MAX_VECTOR_DIMENSIONS = 32_768;
const SIDECAR_FORMAT_VERSION = 1;
const SIDECAR_REVISION = 'writing-knowledge-vectors-v1';
const KNOWLEDGE_RETRIEVAL_INSTRUCTION =
  'Retrieve writing craft, genre, and domain knowledge relevant to the Korean fiction-writing request.';

type CachedDocumentVector = {
  documentFingerprint: string;
  lastUsedAt: number;
  serviceFingerprint: string;
  vector: number[];
};

type IndexedKnowledgeDocument = {
  document: WritingKnowledgeDocument;
  vector: number[];
};

type SemanticCorpusEntry = {
  promise: Promise<IndexedKnowledgeDocument[]>;
  ready: boolean;
};

type SemanticKnowledgeCache = {
  corpora: Map<string, SemanticCorpusEntry>;
  documentVectors: Map<string, CachedDocumentVector>;
  loadedSidecarPath?: string | null;
  persistenceWrite: Promise<void>;
};

type WritingKnowledgeVectorSidecar = {
  entries: Array<{
    cacheKey: string;
    dimensions: number;
    documentFingerprint: string;
    lastUsedAt: number;
    serviceFingerprint: string;
    vectorBase64: string;
  }>;
  revision: string;
  version: number;
};

type SemanticGlobal = typeof globalThis & {
  __museWritingKnowledgeSemanticCache?: SemanticKnowledgeCache;
};

export type SemanticWritingKnowledgeAgentResult = WritingKnowledgeAgentResult & {
  embeddingModel?: string;
  retrievalMode: 'keyword' | 'semantic';
  warning?: string;
};

export type RunSemanticWritingKnowledgeAgentOptions = {
  category?: string;
  db: DB;
  genre?: string;
  instruction: string;
  kind?: string;
  maxChars?: number;
  projectId?: string;
  signal?: AbortSignal;
  storyContext?: string;
  waitForIndex?: boolean;
};

function createEmptySemanticCache(): SemanticKnowledgeCache {
  return {
    corpora: new Map(),
    documentVectors: new Map(),
    persistenceWrite: Promise.resolve(),
  };
}

function getSemanticCache() {
  const scope = globalThis as SemanticGlobal;
  scope.__museWritingKnowledgeSemanticCache ??= createEmptySemanticCache();
  return scope.__museWritingKnowledgeSemanticCache;
}

function embeddingServiceKey(config: EmbeddingServiceConfig) {
  return getEmbeddingFingerprintPrefix(config);
}

function buildDocumentEmbeddingText(document: WritingKnowledgeDocument) {
  return [
    document.title,
    `분류: ${document.category}`,
    document.kind ? `자료 유형: ${document.kind}` : '',
    document.expertise ? `전문가 관점: ${document.expertise}` : '',
    document.genres?.length ? `장르: ${document.genres.join(', ')}` : '',
    document.tags.length ? `태그: ${document.tags.join(', ')}` : '',
    document.summary,
    document.content,
  ].filter(Boolean).join('\n');
}

function documentVectorIdentity(
  serviceKey: string,
  document: WritingKnowledgeDocument
) {
  const documentFingerprint = createHash('sha256')
    .update(`${document.id}\u0000${buildDocumentEmbeddingText(document)}`)
    .digest('hex');
  const cacheKey = createHash('sha256')
    .update(`${serviceKey}\u0000${documentFingerprint}`)
    .digest('hex');
  return { cacheKey, documentFingerprint };
}

function resolveSidecarPath() {
  const explicitPath = process.env.WRITING_KNOWLEDGE_VECTOR_CACHE_PATH?.trim();
  if (explicitPath) return path.resolve(explicitPath);
  // Unit tests must never write into the repository just because this module
  // was imported. Persistence tests opt in with the environment variable.
  if (process.env.NODE_ENV === 'test') return null;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  const databaseDirectory =
    databaseUrl &&
    databaseUrl !== ':memory:' &&
    !databaseUrl.startsWith('file:') &&
    !/^https?:\/\//iu.test(databaseUrl)
      ? path.dirname(path.resolve(databaseUrl))
      : path.join(process.cwd(), 'data');
  return path.join(databaseDirectory, 'writing-knowledge-vectors.json');
}

function isValidFingerprint(value: unknown) {
  return typeof value === 'string' && /^[\w:-]{3,128}$/u.test(value);
}

function decodeVectorBase64(value: unknown, dimensions: unknown) {
  if (
    typeof value !== 'string' ||
    typeof dimensions !== 'number' ||
    !Number.isInteger(dimensions) ||
    dimensions < 1 ||
    dimensions > MAX_VECTOR_DIMENSIONS ||
    value.length > dimensions * 8 ||
    !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u.test(value)
  ) {
    return null;
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.byteLength !== dimensions * Float32Array.BYTES_PER_ELEMENT) {
    return null;
  }
  const vector = Array.from({ length: dimensions }, (_, index) =>
    buffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT)
  );
  return vector.every(Number.isFinite) ? vector : null;
}

function encodeVectorBase64(vector: number[]) {
  const buffer = Buffer.allocUnsafe(
    vector.length * Float32Array.BYTES_PER_ELEMENT
  );
  vector.forEach((value, index) => {
    buffer.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
  });
  return buffer.toString('base64');
}

function loadPersistentVectors(cache: SemanticKnowledgeCache) {
  const sidecarPath = resolveSidecarPath();
  if (cache.loadedSidecarPath !== undefined) return;
  cache.loadedSidecarPath = sidecarPath;
  if (!sidecarPath) return;

  try {
    const stat = fs.statSync(/* turbopackIgnore: true */ sidecarPath);
    if (!stat.isFile() || stat.size < 2 || stat.size > MAX_SIDECAR_BYTES) return;
    const parsed = JSON.parse(
      fs.readFileSync(/* turbopackIgnore: true */ sidecarPath, 'utf8')
    ) as Partial<WritingKnowledgeVectorSidecar>;
    if (
      parsed.version !== SIDECAR_FORMAT_VERSION ||
      parsed.revision !== SIDECAR_REVISION ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length > MAX_DOCUMENT_VECTOR_CACHE_ENTRIES
    ) {
      return;
    }

    for (const entry of parsed.entries) {
      if (
        !entry ||
        typeof entry.cacheKey !== 'string' ||
        !/^[a-f\d]{64}$/u.test(entry.cacheKey) ||
        !/^[a-f\d]{64}$/u.test(entry.documentFingerprint) ||
        !isValidFingerprint(entry.serviceFingerprint)
      ) {
        continue;
      }
      const expectedKey = createHash('sha256')
        .update(`${entry.serviceFingerprint}\u0000${entry.documentFingerprint}`)
        .digest('hex');
      if (entry.cacheKey !== expectedKey) continue;
      const vector = decodeVectorBase64(entry.vectorBase64, entry.dimensions);
      if (!vector) continue;
      cache.documentVectors.set(entry.cacheKey, {
        documentFingerprint: entry.documentFingerprint,
        lastUsedAt: Number.isFinite(entry.lastUsedAt)
          ? entry.lastUsedAt
          : Date.now(),
        serviceFingerprint: entry.serviceFingerprint,
        vector,
      });
    }
  } catch {
    // A truncated, oversized, or otherwise corrupt cache is disposable. The
    // normal embedding path rebuilds it without interrupting writing.
  }
}

function createSidecarJson(cache: SemanticKnowledgeCache) {
  const entries: WritingKnowledgeVectorSidecar['entries'] = [];
  let estimatedBytes = 256;
  const candidates = [...cache.documentVectors.entries()]
    .filter(
      ([, entry]) =>
        entry.vector.length > 0 &&
        entry.vector.length <= MAX_VECTOR_DIMENSIONS &&
        entry.vector.every(Number.isFinite)
    )
    .sort((left, right) => right[1].lastUsedAt - left[1].lastUsedAt);

  for (const [cacheKey, entry] of candidates) {
    const vectorBase64 = encodeVectorBase64(entry.vector);
    const entryBytes = vectorBase64.length + 512;
    if (estimatedBytes + entryBytes > MAX_SIDECAR_BYTES) break;
    entries.push({
      cacheKey,
      dimensions: entry.vector.length,
      documentFingerprint: entry.documentFingerprint,
      lastUsedAt: entry.lastUsedAt,
      serviceFingerprint: entry.serviceFingerprint,
      vectorBase64,
    });
    estimatedBytes += entryBytes;
  }

  const serialized = JSON.stringify({
    entries,
    revision: SIDECAR_REVISION,
    version: SIDECAR_FORMAT_VERSION,
  } satisfies WritingKnowledgeVectorSidecar);
  if (Buffer.byteLength(serialized) > MAX_SIDECAR_BYTES) {
    throw new Error('Writing knowledge vector cache exceeds its size limit.');
  }
  return serialized;
}

function schedulePersistentVectorWrite(cache: SemanticKnowledgeCache) {
  const sidecarPath = cache.loadedSidecarPath ?? resolveSidecarPath();
  if (!sidecarPath) return;

  cache.persistenceWrite = cache.persistenceWrite
    .catch(() => undefined)
    .then(async () => {
      const serialized = createSidecarJson(cache);
      const directory = path.dirname(sidecarPath);
      await fs.promises.mkdir(directory, { recursive: true });
      const temporaryPath = `${sidecarPath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.promises.writeFile(temporaryPath, serialized, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        await fs.promises.rename(temporaryPath, sidecarPath);
      } finally {
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    });
  // The cache is an optimization and may live on a read-only filesystem. Do
  // not turn a persistence failure into an unhandled rejection or failed edit.
  void cache.persistenceWrite.catch(() => undefined);
}

function trimSemanticCache(cache: SemanticKnowledgeCache) {
  while (cache.corpora.size > MAX_CORPUS_CACHE_ENTRIES) {
    const oldestKey = cache.corpora.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.corpora.delete(oldestKey);
  }

  if (cache.documentVectors.size <= MAX_DOCUMENT_VECTOR_CACHE_ENTRIES) return;
  const entries = [...cache.documentVectors.entries()]
    .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)
    .slice(0, cache.documentVectors.size - MAX_DOCUMENT_VECTOR_CACHE_ENTRIES);
  for (const [key] of entries) cache.documentVectors.delete(key);
}

function getOrCreateSemanticCorpus(
  config: EmbeddingServiceConfig,
  documents: WritingKnowledgeDocument[]
) {
  const cache = getSemanticCache();
  loadPersistentVectors(cache);
  const serviceKey = embeddingServiceKey(config);
  const keyedDocuments = documents.map((document) => {
    const identity = documentVectorIdentity(serviceKey, document);
    return { document, ...identity };
  });
  const corpusKey = createHash('sha256')
    .update(keyedDocuments.map(({ cacheKey }) => cacheKey).join('\n'))
    .digest('hex');
  const cacheKey = `${serviceKey}\u0000${corpusKey}`;
  const existing = cache.corpora.get(cacheKey);
  if (existing) return existing;

  const now = Date.now();
  const missing = keyedDocuments.filter(({ cacheKey: documentCacheKey }) => {
    const cached = cache.documentVectors.get(documentCacheKey);
    if (cached) cached.lastUsedAt = now;
    return !cached;
  });

  const readIndexedDocuments = () => {
    const indexed = keyedDocuments.map(({ document, cacheKey: documentCacheKey }) => {
      const vector = cache.documentVectors.get(documentCacheKey)?.vector;
      if (!vector) throw new Error('Writing knowledge embedding was not cached.');
      return { document, vector };
    });
    const dimensions = indexed[0]?.vector.length ?? 0;
    if (
      dimensions === 0 ||
      indexed.some(({ vector }) => vector.length !== dimensions)
    ) {
      throw new Error('Writing knowledge embeddings have mixed dimensions.');
    }
    return indexed;
  };

  const entry: SemanticCorpusEntry = {
    promise: Promise.resolve([]),
    ready: missing.length === 0,
  };
  const buildPromise = missing.length === 0
    ? Promise.resolve().then(readIndexedDocuments)
    : (async () => {
    for (let offset = 0; offset < missing.length; offset += DOCUMENT_EMBEDDING_BATCH_SIZE) {
      const batch = missing.slice(offset, offset + DOCUMENT_EMBEDDING_BATCH_SIZE);
      // Document embeddings deliberately contain no Qwen instruction. The
      // retrieval instruction belongs only on the query side, allowing these
      // shared vectors to serve every project and writing task.
      const embedded = await createEmbeddings(
        config,
        batch.map(({ document }) => buildDocumentEmbeddingText(document))
      );
      batch.forEach(({ cacheKey: documentCacheKey, documentFingerprint }, index) => {
        const vector = embedded.vectors[index];
        if (vector) {
          cache.documentVectors.set(documentCacheKey, {
            documentFingerprint,
            lastUsedAt: now,
            serviceFingerprint: serviceKey,
            vector,
          });
        }
      });
    }
    trimSemanticCache(cache);
    schedulePersistentVectorWrite(cache);
    return readIndexedDocuments();
  })();

  entry.promise = buildPromise;
  cache.corpora.set(cacheKey, entry);
  buildPromise.then(
    () => {
      entry.ready = true;
    },
    () => {
      if (cache.corpora.get(cacheKey) === entry) {
        cache.corpora.delete(cacheKey);
      }
    }
  );
  trimSemanticCache(cache);
  return entry;
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError');
}

function waitForSharedCorpus(
  promise: Promise<IndexedKnowledgeDocument[]>,
  signal?: AbortSignal
) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<IndexedKnowledgeDocument[]>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return Number.NEGATIVE_INFINITY;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function selectSemanticDocuments(
  ranked: Array<{ document: WritingKnowledgeDocument; score: number }>,
  keywordDocuments: WritingKnowledgeDocument[],
  limit = 5
) {
  const selected: WritingKnowledgeDocument[] = [];
  const usedIds = new Set<string>();
  const usedSources = new Set<string>();
  const usedKinds = new Set<string>();

  const add = (document: WritingKnowledgeDocument) => {
    const source = document.sourceUrl ?? document.id;
    if (usedIds.has(document.id) || usedSources.has(source)) return false;
    usedIds.add(document.id);
    usedSources.add(source);
    usedKinds.add(document.kind ?? 'craft');
    selected.push(document);
    return true;
  };

  // Preserve multiple expert lenses before filling the remaining semantic
  // nearest-neighbour slots. Keyword results are used as a hybrid safety net.
  for (const { document } of ranked.slice(0, 20)) {
    if (usedKinds.has(document.kind ?? 'craft')) continue;
    add(document);
    if (selected.length >= Math.min(3, limit)) break;
  }
  for (const { document } of ranked) {
    add(document);
    if (selected.length >= limit) return selected;
  }
  for (const document of keywordDocuments) {
    add(document);
    if (selected.length >= limit) break;
  }
  return selected;
}

/**
 * Retrieves shared writing/wiki knowledge semantically when an embedding API
 * is configured. Any configuration or runtime failure returns the established
 * keyword result so writing remains available while the side service is down.
 */
export async function runSemanticWritingKnowledgeAgent(
  options: RunSemanticWritingKnowledgeAgentOptions
): Promise<SemanticWritingKnowledgeAgentResult> {
  const {
    category,
    db,
    genre = '',
    instruction,
    kind,
    maxChars = 2400,
    projectId,
    signal,
    storyContext = '',
    waitForIndex = true,
  } = options;
  const keywordResult = runWritingKnowledgeAgent({
    category,
    genre,
    instruction,
    kind,
    maxChars,
    storyContext,
  });

  try {
    const config = await resolveEmbeddingServiceConfig(db, projectId);
    if (!config) return { ...keywordResult, retrievalMode: 'keyword' };

    const documents = loadWritingKnowledge().filter(
      (document) =>
        (!category || document.category === category) &&
        (!kind || document.kind === kind)
    );
    if (documents.length === 0) {
      return { ...keywordResult, retrievalMode: 'keyword' };
    }

    const corpusEntry = getOrCreateSemanticCorpus(config, documents);
    if (!corpusEntry.ready && !waitForIndex) {
      void corpusEntry.promise.catch(() => undefined);
      return {
        ...keywordResult,
        retrievalMode: 'keyword',
        warning:
          '작법 지식 의미 검색 인덱스를 백그라운드에서 준비 중입니다. 이번 요청은 키워드 검색을 사용합니다.',
      };
    }
    const corpus = await waitForSharedCorpus(corpusEntry.promise, signal);
    const semanticQuery = [
      genre,
      ...keywordResult.queries,
      storyContext.slice(-1600),
    ].filter(Boolean).join('\n');
    const queryEmbedding = await createQueryEmbedding(
      config,
      semanticQuery,
      signal,
      KNOWLEDGE_RETRIEVAL_INSTRUCTION
    );
    const ranked = corpus
      .map(({ document, vector }) => ({
        document,
        score: cosineSimilarity(queryEmbedding.vector, vector),
      }))
      .filter(({ score }) => Number.isFinite(score))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.document.title.localeCompare(right.document.title, 'ko')
      );
    if (ranked.length === 0) throw new Error('No comparable writing knowledge vectors.');

    const keywordDocuments = keywordResult.matches
      .map((match) => documents.find((document) => document.id === match.id))
      .filter((document): document is WritingKnowledgeDocument => Boolean(document));
    const selected = selectSemanticDocuments(ranked, keywordDocuments);
    const contextQuery = [semanticQuery, instruction].join(' ');

    return {
      context: buildWritingKnowledgeContextFromDocuments(
        selected,
        contextQuery,
        maxChars
      ),
      embeddingModel: queryEmbedding.model,
      matches: selected.map((document) => ({
        category: document.category,
        id: document.id,
        kind: document.kind,
        summary: document.summary,
        title: document.title,
      })),
      queries: keywordResult.queries,
      retrievalMode: 'semantic',
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...keywordResult,
      retrievalMode: 'keyword',
      warning:
        error instanceof Error
          ? `의미 기반 작법 지식 검색을 사용할 수 없어 키워드 검색으로 전환했습니다: ${error.message}`
          : '의미 기반 작법 지식 검색을 사용할 수 없어 키워드 검색으로 전환했습니다.',
    };
  }
}

export function resetSemanticWritingKnowledgeCacheForTests() {
  const scope = globalThis as SemanticGlobal;
  scope.__museWritingKnowledgeSemanticCache = createEmptySemanticCache();
}

export async function flushSemanticWritingKnowledgeCacheForTests() {
  await getSemanticCache().persistenceWrite;
}
