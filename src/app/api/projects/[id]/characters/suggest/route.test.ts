import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIRequestQueueFullError } from '@/lib/ai/request-scheduler';

vi.mock('@/lib/ai/entity-suggestions', () => ({
  generateCharacterSuggestion: vi.fn(),
}));

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/projects/project-1/characters/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/projects/[id]/characters/suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when description is missing', async () => {
    const { POST } = await import('./route');

    const res = await POST(createRequest({}), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: '설명은 필수입니다.' });
  });

  it('returns suggestion payload on success', async () => {
    const { generateCharacterSuggestion } = await import('@/lib/ai/entity-suggestions');
    vi.mocked(generateCharacterSuggestion).mockResolvedValue({
      name: '리안',
      role: '주인공',
      personality: '냉정하지만 속정이 깊다.',
    });

    const { POST } = await import('./route');

    const res = await POST(createRequest({ description: '복수심에 불타는 검사' }), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      name: '리안',
      role: '주인공',
      personality: '냉정하지만 속정이 깊다.',
    });
    expect(generateCharacterSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      abortSignal: expect.any(AbortSignal),
      description: '복수심에 불타는 검사',
      projectId: 'project-1',
    }));
  });

  it('returns 500 when suggestion generation fails', async () => {
    const { generateCharacterSuggestion } = await import('@/lib/ai/entity-suggestions');
    vi.mocked(generateCharacterSuggestion).mockRejectedValue(new Error('AI unavailable'));

    const { POST } = await import('./route');

    const res = await POST(createRequest({ description: '떠돌이 마법사' }), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'AI unavailable' });
  });

  it('returns a retryable 429 response when the local queue is full', async () => {
    const { generateCharacterSuggestion } = await import('@/lib/ai/entity-suggestions');
    vi.mocked(generateCharacterSuggestion).mockRejectedValue(
      new AIRequestQueueFullError(6)
    );
    const { POST } = await import('./route');

    const res = await POST(createRequest({ description: '떠돌이 마법사' }), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('6');
    await expect(res.json()).resolves.toMatchObject({ code: 'ai_queue_full' });
  });
});
