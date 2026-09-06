import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const documents = [
  {
    category: '대사',
    content: '서브텍스트를 활용한다.',
    domains: [],
    expertise: '소설 작법',
    filePath: '/knowledge/dialogue.md',
    genres: ['무협'],
    id: 'dialogue',
    kind: 'craft',
    summary: '대사 작법',
    tags: ['대사'],
    title: '대사 쓰기',
  },
];

vi.mock('@/lib/knowledge/writing-knowledge', () => ({
  getWritingKnowledgeDocument: vi.fn(),
  loadWritingKnowledge: vi.fn(() => documents),
  runWritingKnowledgeAgent: vi.fn(),
  searchWritingKnowledge: vi.fn(() => []),
}));

describe('/api/writing-knowledge browser index', () => {
  it('returns all documents with a stable version and ETag', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('http://localhost/api/writing-knowledge?mode=index')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(`"${body.version}"`);
    expect(body).toMatchObject({
      categories: ['대사'],
      documents: [{ content: '서브텍스트를 활용한다.', id: 'dialogue' }],
      total: 1,
    });
  });

  it('answers a matching conditional request without retransmitting the index', async () => {
    const { GET } = await import('./route');
    const first = await GET(
      new NextRequest('http://localhost/api/writing-knowledge?mode=index')
    );
    const etag = first.headers.get('etag') ?? '';
    const response = await GET(
      new NextRequest('http://localhost/api/writing-knowledge?mode=index', {
        headers: { 'if-none-match': etag },
      })
    );

    expect(response.status).toBe(304);
    await expect(response.text()).resolves.toBe('');
  });
});
