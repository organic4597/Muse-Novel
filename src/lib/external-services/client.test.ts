import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  normalizeExternalServiceUrl,
  testExternalService,
} from './client';

describe('external service client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes a valid HTTP URL', () => {
    expect(normalizeExternalServiceUrl('http://127.0.0.1:9877/')).toBe(
      'http://127.0.0.1:9877'
    );
  });

  it('rejects non-HTTP protocols', () => {
    expect(() => normalizeExternalServiceUrl('file:///tmp/service')).toThrow(
      'HTTP 또는 HTTPS'
    );
  });

  it('calls the standard health endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      testExternalService('http://127.0.0.1:9877')
    ).resolves.toEqual({ ok: true, message: 'API 연결 성공' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9877/health',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('can test an OpenAI-compatible models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await testExternalService('http://127.0.0.1:8081/', '/v1/models');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/v1/models',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('attaches an optional bearer token only to the server-side request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await testExternalService('http://127.0.0.1:8081', '/v1/models', {
      bearerToken: 'secret',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
      })
    );
  });
});
