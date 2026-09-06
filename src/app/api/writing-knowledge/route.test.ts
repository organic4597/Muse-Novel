import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/knowledge/writing-knowledge', () => ({
  buildWritingKnowledgeContext: vi.fn(() => '검색 문맥'),
  buildWritingKnowledgeContextFromDocuments: vi.fn(() => '검색 문맥'),
  getWritingKnowledgeDocument: vi.fn(),
  loadWritingKnowledge: vi.fn(() => []),
  runWritingKnowledgeAgent: vi.fn(() => ({
    context: '검색 문맥',
    matches: [],
    queries: ['대사의 긴장감을 높이는 법'],
  })),
  selectWritingKnowledgeDocuments: vi.fn(() => []),
  searchWritingKnowledge: vi.fn(() => []),
}));

describe('/api/writing-knowledge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a tool-friendly bounded context', async () => {
    const { runWritingKnowledgeAgent } = await import('@/lib/knowledge/writing-knowledge');
    vi.mocked(runWritingKnowledgeAgent).mockReturnValue({
      context: '검색 문맥',
      matches: [{
        category: '대사',
        id: 'dialogue',
        kind: 'craft',
        summary: '서브텍스트 활용',
        title: '대사 쓰기',
      }],
      queries: ['대사의 긴장감을 높이는 법', '대사 목적 서브텍스트'],
    });
    const { POST } = await import('./route');
    const request = new NextRequest('http://localhost/api/writing-knowledge', {
      method: 'POST',
      body: JSON.stringify({ query: '대사의 긴장감을 높이는 법' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      context: '검색 문맥',
      matches: [{ id: 'dialogue', title: '대사 쓰기' }],
    });
  });

  it('rejects an empty query', async () => {
    const { POST } = await import('./route');
    const request = new NextRequest('http://localhost/api/writing-knowledge', {
      method: 'POST',
      body: JSON.stringify({ query: '' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
