import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/entity-suggestions', () => ({
  generateWorldEntrySuggestion: vi.fn(),
}));

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/projects/project-1/world-entries/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/projects/[id]/world-entries/suggest', () => {
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
    const { generateWorldEntrySuggestion } = await import('@/lib/ai/entity-suggestions');
    vi.mocked(generateWorldEntrySuggestion).mockResolvedValue({
      title: '검은 성역',
      category: '장소',
      content: '죽은 왕들의 무덤이 모인 금단의 성역.',
      tags: ['금단', '왕가'],
    });

    const { POST } = await import('./route');

    const res = await POST(createRequest({ description: '왕가의 비밀 무덤' }), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      title: '검은 성역',
      category: '장소',
      content: '죽은 왕들의 무덤이 모인 금단의 성역.',
      tags: ['금단', '왕가'],
    });
    expect(generateWorldEntrySuggestion).toHaveBeenCalledWith(expect.objectContaining({
      abortSignal: expect.any(AbortSignal),
      description: '왕가의 비밀 무덤',
      projectId: 'project-1',
    }));
  });
});
