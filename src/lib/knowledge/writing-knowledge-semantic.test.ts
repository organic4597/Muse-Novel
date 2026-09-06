import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DB } from '@/lib/db';

import { resetWritingKnowledgeCacheForTests } from './writing-knowledge';
import {
  flushSemanticWritingKnowledgeCacheForTests,
  resetSemanticWritingKnowledgeCacheForTests,
  runSemanticWritingKnowledgeAgent,
} from './writing-knowledge-semantic';

const embeddingMocks = vi.hoisted(() => ({
  createEmbeddings: vi.fn(),
  createQueryEmbedding: vi.fn(),
  getEmbeddingFingerprintPrefix: vi.fn(),
  resolveEmbeddingServiceConfig: vi.fn(),
}));

vi.mock('@/lib/memory/embedding-client', () => embeddingMocks);

const config = {
  baseUrl: 'http://127.0.0.1:8081/v1',
  model: 'Qwen3-Embedding-0.6B',
};
let tempDirectory = '';

function addDocument(name: string, metadata: string, body: string) {
  fs.writeFileSync(
    path.join(tempDirectory, `${name}.md`),
    `---\n${metadata}\n---\n${body}`
  );
}

beforeEach(() => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-semantic-knowledge-'));
  vi.stubEnv('WRITING_KNOWLEDGE_DIR', tempDirectory);
  vi.stubEnv('WRITING_KNOWLEDGE_VECTOR_CACHE_PATH', '');
  resetWritingKnowledgeCacheForTests();
  resetSemanticWritingKnowledgeCacheForTests();
  embeddingMocks.createEmbeddings.mockReset();
  embeddingMocks.createQueryEmbedding.mockReset();
  embeddingMocks.getEmbeddingFingerprintPrefix.mockReset();
  embeddingMocks.getEmbeddingFingerprintPrefix.mockReturnValue('emb-v2:test');
  embeddingMocks.resolveEmbeddingServiceConfig.mockReset();
  embeddingMocks.resolveEmbeddingServiceConfig.mockResolvedValue(config);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  resetWritingKnowledgeCacheForTests();
  resetSemanticWritingKnowledgeCacheForTests();
});

describe('semantic writing knowledge retrieval', () => {
  it('finds a concept without a keyword match and keeps instructions query-only', async () => {
    addDocument(
      'breath',
      'id: breath\ntitle: 호흡과 리듬\ncategory: craft\nkind: craft\ntags: [문장]\nsummary: 문장의 리듬을 조절한다',
      '길고 짧은 문장을 교차한다.'
    );
    addDocument(
      'diving',
      'id: diving\ntitle: 잠수 장면의 생리\ncategory: domain\nkind: domain\ntags: [잠수, 생리]\nsummary: 수중 활동의 신체 반응',
      '산소가 부족해지면 판단과 운동 능력이 차례로 저하된다.'
    );
    embeddingMocks.createEmbeddings.mockImplementation(
      async (_config: unknown, input: string[]) => ({
        model: config.model,
        vectors: input.map((text) =>
          text.includes('잠수 장면의 생리') ? [1, 0] : [0, 1]
        ),
      })
    );
    embeddingMocks.createQueryEmbedding.mockResolvedValue({
      model: config.model,
      vector: [1, 0],
    });

    const result = await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '밀폐된 환경에서 의식이 흐려지는 장면을 현실적으로 써줘',
      maxChars: 800,
      projectId: 'project-one',
    });

    expect(result.retrievalMode).toBe('semantic');
    expect(result.matches[0]?.id).toBe('diving');
    const documentInputs = embeddingMocks.createEmbeddings.mock.calls.flatMap(
      (call) => call[1] as string[]
    );
    expect(documentInputs).not.toHaveLength(0);
    expect(documentInputs.every((text) => !text.includes('Instruct:'))).toBe(true);
    expect(embeddingMocks.createQueryEmbedding).toHaveBeenCalledWith(
      config,
      expect.stringContaining('밀폐된 환경'),
      undefined,
      expect.stringContaining('writing craft')
    );
  });

  it('shares unchanged document vectors across projects using the same service', async () => {
    addDocument(
      'scene',
      'id: scene\ntitle: 장면 목표\ncategory: craft\nkind: craft\ntags: [장면]\nsummary: 목표와 갈등',
      '장면마다 관점 인물의 목표를 정한다.'
    );
    embeddingMocks.createEmbeddings.mockResolvedValue({
      model: config.model,
      vectors: [[1, 0]],
    });
    embeddingMocks.createQueryEmbedding.mockResolvedValue({
      model: config.model,
      vector: [1, 0],
    });

    await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '첫 장면을 써줘',
      projectId: 'project-one',
    });
    await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '다른 장면을 써줘',
      projectId: 'project-two',
    });

    expect(embeddingMocks.createEmbeddings).toHaveBeenCalledTimes(1);
    expect(embeddingMocks.createQueryEmbedding).toHaveBeenCalledTimes(2);
  });

  it('falls back to keyword retrieval when the embedding service fails', async () => {
    addDocument(
      'dialogue',
      'id: dialogue\ntitle: 대사와 서브텍스트\ncategory: craft\nkind: craft\ntags: [대사]\nsummary: 대사의 숨은 목적',
      '대사에는 겉으로 말하지 않는 목적이 필요하다.'
    );
    embeddingMocks.createEmbeddings.mockRejectedValue(new Error('service offline'));

    const result = await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '대사를 자연스럽게 써줘',
      projectId: 'project-one',
    });

    expect(result.retrievalMode).toBe('keyword');
    expect(result.matches.some((match) => match.id === 'dialogue')).toBe(true);
    expect(result.warning).toContain('service offline');
  });

  it('persists finite vectors and reloads them without re-embedding after restart', async () => {
    const sidecarPath = path.join(tempDirectory, 'vectors.json');
    vi.stubEnv('WRITING_KNOWLEDGE_VECTOR_CACHE_PATH', sidecarPath);
    resetSemanticWritingKnowledgeCacheForTests();
    addDocument(
      'scene',
      'id: scene\ntitle: 장면 목표\ncategory: craft\nkind: craft\ntags: [장면]\nsummary: 목표와 갈등',
      '관점 인물의 목표와 방해를 연결한다.'
    );
    embeddingMocks.createEmbeddings.mockResolvedValue({
      model: config.model,
      vectors: [[0.25, 0.75]],
    });
    embeddingMocks.createQueryEmbedding.mockResolvedValue({
      model: config.model,
      vector: [0.25, 0.75],
    });

    await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '장면을 설계해줘',
      projectId: 'project-one',
    });
    await flushSemanticWritingKnowledgeCacheForTests();
    expect(fs.statSync(sidecarPath).size).toBeGreaterThan(50);

    resetSemanticWritingKnowledgeCacheForTests();
    embeddingMocks.createEmbeddings.mockClear();
    const result = await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '새로운 장면의 장애물을 정해줘',
      projectId: 'project-two',
    });

    expect(result.retrievalMode).toBe('semantic');
    expect(embeddingMocks.createEmbeddings).not.toHaveBeenCalled();
  });

  it('rejects a non-finite persisted vector and safely rebuilds the cache', async () => {
    const sidecarPath = path.join(tempDirectory, 'vectors.json');
    vi.stubEnv('WRITING_KNOWLEDGE_VECTOR_CACHE_PATH', sidecarPath);
    resetSemanticWritingKnowledgeCacheForTests();
    addDocument(
      'continuity',
      'id: continuity\ntitle: 연속성 점검\ncategory: craft\nkind: craft\ntags: [연속성]\nsummary: 설정 충돌을 찾는다',
      '인물의 소지품과 부상을 다음 장면까지 추적한다.'
    );
    embeddingMocks.createEmbeddings.mockResolvedValue({
      model: config.model,
      vectors: [[1, 0]],
    });
    embeddingMocks.createQueryEmbedding.mockResolvedValue({
      model: config.model,
      vector: [1, 0],
    });
    await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '설정 충돌을 검사해줘',
    });
    await flushSemanticWritingKnowledgeCacheForTests();

    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as {
      entries: Array<{ vectorBase64: string }>;
    };
    const invalidVector = Buffer.alloc(2 * Float32Array.BYTES_PER_ELEMENT);
    invalidVector.writeFloatLE(Number.NaN, 0);
    invalidVector.writeFloatLE(1, Float32Array.BYTES_PER_ELEMENT);
    if (sidecar.entries[0]) {
      sidecar.entries[0].vectorBase64 = invalidVector.toString('base64');
    }
    fs.writeFileSync(sidecarPath, JSON.stringify(sidecar));

    resetSemanticWritingKnowledgeCacheForTests();
    embeddingMocks.createEmbeddings.mockClear();
    const result = await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '설정 충돌을 검사해줘',
    });
    await flushSemanticWritingKnowledgeCacheForTests();

    expect(result.retrievalMode).toBe('semantic');
    expect(embeddingMocks.createEmbeddings).toHaveBeenCalledTimes(1);
  });

  it('returns keyword results immediately while a cold shared index warms up', async () => {
    addDocument(
      'pacing',
      'id: pacing\ntitle: 장면 속도\ncategory: craft\nkind: craft\ntags: [속도]\nsummary: 장면의 속도',
      '문장 길이와 사건 밀도를 조절한다.'
    );
    let finishEmbedding: ((value: { model: string; vectors: number[][] }) => void) | undefined;
    embeddingMocks.createEmbeddings.mockImplementation(
      () => new Promise((resolve) => {
        finishEmbedding = resolve;
      })
    );
    embeddingMocks.createQueryEmbedding.mockResolvedValue({
      model: config.model,
      vector: [1, 0],
    });

    const coldResult = await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '속도감 있게 써줘',
      waitForIndex: false,
    });

    expect(coldResult.retrievalMode).toBe('keyword');
    expect(coldResult.warning).toContain('백그라운드');
    expect(embeddingMocks.createQueryEmbedding).not.toHaveBeenCalled();
    finishEmbedding?.({ model: config.model, vectors: [[1, 0]] });

    const warmResult = await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '호흡을 빠르게 만들어줘',
    });
    expect(warmResult.retrievalMode).toBe('semantic');
  });

  it('lets one caller abort without cancelling the shared corpus build', async () => {
    addDocument(
      'dialogue',
      'id: dialogue\ntitle: 대사\ncategory: craft\nkind: craft\ntags: [대사]\nsummary: 대사의 목적',
      '대사는 목적이 충돌하는 행동이다.'
    );
    let finishEmbedding: ((value: { model: string; vectors: number[][] }) => void) | undefined;
    embeddingMocks.createEmbeddings.mockImplementation(
      () => new Promise((resolve) => {
        finishEmbedding = resolve;
      })
    );
    embeddingMocks.createQueryEmbedding.mockResolvedValue({
      model: config.model,
      vector: [1, 0],
    });
    const controller = new AbortController();
    const aborted = runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '대사를 써줘',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(finishEmbedding).toBeTypeOf('function'));
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(embeddingMocks.createEmbeddings.mock.calls[0]?.[2]).toBeUndefined();
    finishEmbedding?.({ model: config.model, vectors: [[1, 0]] });

    const nextCaller = await runSemanticWritingKnowledgeAgent({
      db: {} as DB,
      instruction: '갈등이 있는 대사를 써줘',
    });
    expect(nextCaller.retrievalMode).toBe('semantic');
    expect(embeddingMocks.createEmbeddings).toHaveBeenCalledTimes(1);
  });
});
