import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn() }));
vi.mock('@/lib/memory/project-memory', () => ({
  indexProjectMemory: vi.fn(),
  retrieveProjectMemory: vi.fn(),
}));

describe('/api/projects/[id]/memory', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getProject } = await import('@/lib/db/queries/projects');
    vi.mocked(getProject).mockResolvedValue({ id: 'project-1' } as never);
  });

  it('indexes project memory and reports keyword fallback', async () => {
    const { indexProjectMemory } = await import('@/lib/memory/project-memory');
    vi.mocked(indexProjectMemory).mockResolvedValue({
      chunks: 12,
      embeddingAvailable: false,
      removedSources: 0,
      skippedSources: 2,
      updatedSources: 3,
    });
    const { POST } = await import('./route');
    const response = await POST(
      new NextRequest('http://localhost/api/projects/project-1/memory', {
        body: JSON.stringify({ action: 'index' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      chunks: 12,
      embeddingAvailable: false,
    });
  });

  it('validates search input and returns hybrid matches', async () => {
    const { GET } = await import('./route');
    const invalid = await GET(
      new NextRequest('http://localhost/api/projects/project-1/memory?q='),
      { params: Promise.resolve({ id: 'project-1' }) }
    );
    expect(invalid.status).toBe(400);

    const { retrieveProjectMemory } = await import('@/lib/memory/project-memory');
    vi.mocked(retrieveProjectMemory).mockResolvedValue({
      matches: [{ content: '정전', score: 0.9 } as never],
      mode: 'hybrid',
    });
    const valid = await GET(
      new NextRequest(
        'http://localhost/api/projects/project-1/memory?q=%EA%B2%80%EC%9D%80%20%ED%86%A0%EB%81%BC'
      ),
      { params: Promise.resolve({ id: 'project-1' }) }
    );
    expect(await valid.json()).toMatchObject({ mode: 'hybrid' });
  });
});

