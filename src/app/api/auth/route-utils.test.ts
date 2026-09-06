import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readAuthBody, requestBodyIsAcceptable } from './route-utils';

afterEach(() => {
  vi.useRealTimers();
});

function jsonRequest(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest('http://muse.local/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body,
  });
}

describe('bounded authentication request bodies', () => {
  it('reads JSON without relying on Content-Length', async () => {
    const request = jsonRequest(JSON.stringify({ username: 'admin' }));
    expect(request.headers.get('content-length')).toBeNull();
    await expect(readAuthBody(request)).resolves.toEqual({ username: 'admin' });
  });

  it('rejects a wrong media type or declared oversized body', () => {
    const wrongType = new NextRequest('http://muse.local/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(requestBodyIsAcceptable(wrongType)).toBe(false);
    expect(requestBodyIsAcceptable(jsonRequest('{}', { 'content-length': '4097' }))).toBe(false);
  });

  it('stops an undeclared chunked body after 4096 bytes', async () => {
    const request = jsonRequest(JSON.stringify({ value: 'x'.repeat(5000) }));
    await expect(readAuthBody(request)).resolves.toBeNull();
  });

  it('abandons a stalled body at the read deadline', async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    const request = jsonRequest(stream);
    const pending = readAuthBody(request);
    await vi.advanceTimersByTimeAsync(3001);
    await expect(pending).resolves.toBeNull();
  });
});
