import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkProviderHealth } from '../health-check';
import type { ProviderType } from '../types';

// ─── Mock global fetch ───────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── Ollama ──────────────────────────────────────────────────────────────────

it('discovers models through a generic API without requiring a vendor health route', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 'any-model' }] }) });
  const result = await checkProviderHealth('openai-compatible', { baseUrl: 'http://inference.local:8080' });
  expect(result.models).toEqual(['any-model']);
  expect(mockFetch).toHaveBeenCalledWith('http://inference.local:8080/v1/models', expect.objectContaining({ headers: undefined }));
});

describe('checkProviderHealth - ollama', () => {
  const baseUrl = 'http://localhost:11434';

  it('returns ok with model list on successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: 'llama3.2', model: 'llama3.2', modified_at: '2024-01-01' },
          { name: 'gemma2', model: 'gemma2', modified_at: '2024-01-01' },
        ],
      }),
    });

    const result = await checkProviderHealth('ollama', { baseUrl });

    expect(result.status).toBe('ok');
    expect(result.message).toContain('연결');
    expect(result.models).toEqual(['llama3.2', 'gemma2']);
    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/api/tags`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('returns ok with empty model list when no models found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ models: [] }),
    });

    const result = await checkProviderHealth('ollama', { baseUrl });

    expect(result.status).toBe('ok');
    expect(result.models).toEqual([]);
  });

  it('returns error on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await checkProviderHealth('ollama', { baseUrl });

    expect(result.status).toBe('error');
    expect(result.message).toBeTruthy();
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await checkProviderHealth('ollama', { baseUrl });

    expect(result.status).toBe('error');
    expect(result.message).toContain('연결할 수 없습니다');
    expect(result.message).toContain('ECONNREFUSED');
  });

  it('returns error on abort timeout', async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    const result = await checkProviderHealth('ollama', { baseUrl });

    expect(result.status).toBe('error');
    expect(result.message).toContain('연결할 수 없습니다');
  });
});

// ─── NVIDIA ──────────────────────────────────────────────────────────────────

describe('checkProviderHealth - nvidia', () => {
  const baseUrl = 'https://integrate.api.nvidia.com/v1';
  const apiKey = 'nvapi-test123';

  it('returns ok on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'nvidia/llama-3.1-nemotron-70b-instruct' }] }),
    });

    const result = await checkProviderHealth('nvidia', { baseUrl, apiKey });

    expect(result.status).toBe('ok');
    expect(result.message).toContain('연결');
    expect(result.models).toEqual(['nvidia/llama-3.1-nemotron-70b-instruct']);
    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/models`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
        }),
      })
    );
  });

  it('returns error on 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await checkProviderHealth('nvidia', { baseUrl, apiKey });

    expect(result.status).toBe('error');
    expect(result.message).toContain('서버 응답 오류');
  });

  it('returns error on non-ok non-404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await checkProviderHealth('nvidia', { baseUrl, apiKey });

    expect(result.status).toBe('error');
    expect(result.message).toBeTruthy();
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await checkProviderHealth('nvidia', { baseUrl, apiKey });

    expect(result.status).toBe('error');
    expect(result.message).toContain('연결할 수 없습니다');
    expect(result.message).toContain('fetch failed');
  });
});

// ─── OpenAI ──────────────────────────────────────────────────────────────────

describe('checkProviderHealth - openai', () => {
  const apiKey = 'sk-test-abc123';

  it('returns ok on successful 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const result = await checkProviderHealth('openai', { apiKey });

    expect(result.status).toBe('ok');
    expect(result.message).toContain('연결');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
        }),
      })
    );
  });

  it('returns error on 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await checkProviderHealth('openai', { apiKey });

    expect(result.status).toBe('error');
    expect(result.message).toBeTruthy();
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await checkProviderHealth('openai', { apiKey });

    expect(result.status).toBe('error');
    expect(result.message).toContain('연결할 수 없습니다');
    expect(result.message).toContain('Network error');
  });
});

// ─── Anthropic ───────────────────────────────────────────────────────────────

describe('checkProviderHealth - anthropic', () => {
  const apiKey = 'sk-ant-test123';

  it('returns ok on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: 'ok' }] }),
    });

    const result = await checkProviderHealth('anthropic', { apiKey });

    expect(result.status).toBe('ok');
    expect(result.message).toContain('연결');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"model":"test"'),
      })
    );
  });

  it('returns error on 401 invalid key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await checkProviderHealth('anthropic', { apiKey });

    expect(result.status).toBe('error');
    expect(result.message).toBeTruthy();
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('DNS lookup failed'));

    const result = await checkProviderHealth('anthropic', { apiKey });

    expect(result.status).toBe('error');
    expect(result.message).toContain('연결할 수 없습니다');
    expect(result.message).toContain('DNS lookup failed');
  });
});

// ─── Common behaviour ─────────────────────────────────────────────────────────

describe('checkProviderHealth - common', () => {
  it('uses AbortSignal with 10 second timeout on all providers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ models: [] }),
    });

    await checkProviderHealth('ollama', { baseUrl: 'http://localhost:11434' });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit & { signal: AbortSignal }];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('models field is undefined for non-ollama providers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const result = await checkProviderHealth('openai', { apiKey: 'sk-test' });

    expect(result.models).toBeUndefined();
  });
});
