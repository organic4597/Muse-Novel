import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

function createRequest(body: unknown) {
  return new Request('http://localhost/api/external-services/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/external-services/test', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('injects the server-side embedding bearer key without returning it', async () => {
    vi.stubEnv('EMBEDDING_API_KEY', 'server-only-secret');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest({
        baseUrl: 'http://127.0.0.1:8081',
        healthPath: '/v1/models',
        serviceType: 'embedding',
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8081/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer server-only-secret' },
      })
    );
    expect(await response.text()).not.toContain('server-only-secret');
  });

  it('does not attach the embedding key to another service type', async () => {
    vi.stubEnv('EMBEDDING_API_KEY', 'server-only-secret');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await POST(
      createRequest({
        baseUrl: 'http://127.0.0.1:9877',
        healthPath: '/health',
        serviceType: 'tag-recommender',
      })
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9877/health',
      expect.objectContaining({ headers: undefined })
    );
  });
});
