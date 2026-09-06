import { createHash } from 'node:crypto';

import type { DB } from '@/lib/db';
import { getExternalService } from '@/lib/db/queries/external-services';

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MODEL = 'Qwen3-Embedding-0.6B';
const DEFAULT_RETRIEVAL_INSTRUCTION =
  'Retrieve project canon passages relevant to the writing or consistency request.';
const EMBEDDING_FINGERPRINT_VERSION = 'emb-v2';

export type EmbeddingServiceConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
};

export type EmbeddingBatchResult = {
  model: string;
  vectors: number[][];
};

export function getEmbeddingFingerprintPrefix(config: EmbeddingServiceConfig) {
  const identity = JSON.stringify({
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    model: config.model,
    pooling: process.env.EMBEDDING_POOLING?.trim() || 'server-default',
    revision: process.env.EMBEDDING_REVISION?.trim() || '',
    version: EMBEDDING_FINGERPRINT_VERSION,
  });
  const hash = createHash('sha256').update(identity).digest('hex').slice(0, 20);
  return `${EMBEDDING_FINGERPRINT_VERSION}:${hash}`;
}

export function getEmbeddingFingerprint(
  config: EmbeddingServiceConfig,
  dimensions: number,
  reportedModel = config.model
) {
  const reportedHash = createHash('sha256')
    .update(reportedModel)
    .digest('hex')
    .slice(0, 12);
  return `${getEmbeddingFingerprintPrefix(config)}:m${reportedHash}:d${dimensions}`;
}

function withV1Path(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

export async function resolveEmbeddingServiceConfig(
  db: DB,
  projectId?: string
): Promise<EmbeddingServiceConfig | null> {
  const projectSetting = projectId
    ? await getExternalService(db, 'embedding', projectId)
    : undefined;
  const globalSetting = await getExternalService(db, 'embedding', null);
  const baseUrl =
    projectSetting?.baseUrl ??
    globalSetting?.baseUrl ??
    process.env.EMBEDDING_BASE_URL?.trim();

  if (!baseUrl) return null;

  return {
    apiKey: process.env.EMBEDDING_API_KEY?.trim() || undefined,
    baseUrl: withV1Path(baseUrl),
    model: process.env.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function isFiniteVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

/** Calls an OpenAI-compatible `/v1/embeddings` endpoint. */
export async function createEmbeddings(
  config: EmbeddingServiceConfig,
  input: string[],
  signal?: AbortSignal
): Promise<EmbeddingBatchResult> {
  if (input.length === 0) return { model: config.model, vectors: [] };

  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey
        ? { Authorization: `Bearer ${config.apiKey}` }
        : {}),
    },
    body: JSON.stringify({ input, model: config.model }),
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: unknown; index?: number }>;
    model?: string;
  };
  const ordered = [...(payload.data ?? [])].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );
  const vectors = ordered.map((item) => item.embedding);

  if (vectors.length !== input.length || !vectors.every(isFiniteVector)) {
    throw new Error('Embedding API returned an invalid vector payload.');
  }

  const dimensions = vectors[0]?.length ?? 0;
  if (vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error('Embedding API returned vectors with mixed dimensions.');
  }

  return {
    model: payload.model?.trim() || config.model,
    vectors,
  };
}

/**
 * Qwen3 Embedding recommends an instruction only on the query side. Indexed
 * documents remain unchanged so the same vectors support multiple tasks.
 */
export async function createQueryEmbedding(
  config: EmbeddingServiceConfig,
  query: string,
  signal?: AbortSignal,
  instruction = DEFAULT_RETRIEVAL_INSTRUCTION
) {
  const input = `Instruct: ${instruction}\nQuery: ${query.trim()}`;
  const result = await createEmbeddings(config, [input], signal);
  return { model: result.model, vector: result.vectors[0] ?? [] };
}
