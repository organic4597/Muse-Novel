import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiffusersApiClient } from './diffusers-api-client';

describe('DiffusersApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the registered health endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const client = new DiffusersApiClient('http://127.0.0.1:7861/');
    await expect(client.checkConnection()).resolves.toEqual({
      ok: true,
      message: 'Diffusers API 연결 성공',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7861/health',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('calls generate and returns base64 image metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [{ base64: 'aW1hZ2U=', seed: 42, width: 512, height: 512 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new DiffusersApiClient('http://127.0.0.1:7861');
    const result = await client.generate({
      prompt: 'portrait',
      width: 512,
      height: 512,
      steps: 20,
      sampler: 'euler_a',
      cfgScale: 6,
      batchSize: 1,
    });

    expect(result.images[0]?.seed).toBe(42);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7861/generate',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
