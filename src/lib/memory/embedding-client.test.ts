import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createEmbeddings,
  createQueryEmbedding,
} from './embedding-client';

describe('embedding client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('orders OpenAI-compatible vectors and sends a bearer key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        data: [
          { embedding: [0, 1], index: 1 },
          { embedding: [1, 0], index: 0 },
        ],
        model: 'qwen-embedding',
      }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createEmbeddings(
        {
          apiKey: 'secret',
          baseUrl: 'http://127.0.0.1:8081/v1',
          model: 'qwen-embedding',
        },
        ['문서 하나', '문서 둘']
      )
    ).resolves.toEqual({
      model: 'qwen-embedding',
      vectors: [
        [1, 0],
        [0, 1],
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/v1/embeddings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      })
    );
  });

  it('adds the retrieval instruction only to a query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ data: [{ embedding: [1, 2], index: 0 }] }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    await createQueryEmbedding(
      { baseUrl: 'http://localhost:8081/v1', model: 'qwen' },
      '검은 토끼의 소지품'
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.input[0]).toContain('Instruct:');
    expect(body.input[0]).toContain('Query: 검은 토끼의 소지품');
  });

  it('rejects malformed or mixed-size vectors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          data: [
            { embedding: [1, 2], index: 0 },
            { embedding: [3], index: 1 },
          ],
        }),
        ok: true,
      })
    );
    await expect(
      createEmbeddings(
        { baseUrl: 'http://localhost:8081/v1', model: 'qwen' },
        ['a', 'b']
      )
    ).rejects.toThrow('mixed dimensions');
  });

  it('allows slow local embedding models up to 90 seconds', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ data: [{ embedding: [1, 2], index: 0 }] }),
        ok: true,
      })
    );

    await createEmbeddings(
      { baseUrl: 'http://localhost:8081/v1', model: 'qwen' },
      ['slow document']
    );

    expect(timeoutSpy).toHaveBeenCalledWith(90_000);
    timeoutSpy.mockRestore();
  });
});
