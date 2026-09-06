import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn() }));
vi.mock('@/lib/ai/story-consistency', () => ({ analyzeStoryConsistency: vi.fn() }));

describe('POST /api/projects/[id]/consistency', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getProject } = await import('@/lib/db/queries/projects');
    vi.mocked(getProject).mockResolvedValue({ id: 'project-1' } as never);
  });

  it('returns structured findings without an unrelated embedding pass', async () => {
    const { analyzeStoryConsistency } = await import('@/lib/ai/story-consistency');
    vi.mocked(analyzeStoryConsistency).mockResolvedValue({
      findings: [
        {
          category: 'timeline',
          confidence: 0.9,
          description: '해가 두 번 진다.',
          evidence: [
            { quote: '해가 졌다.', sourceId: 'chapter-1', sourceTitle: '1장' },
          ],
          severity: 'warning',
          suggestion: '시간 표기를 조정한다.',
          title: '시간 경과 불일치',
        },
      ],
      summary: '주의 1건',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new NextRequest('http://localhost/api/projects/project-1/consistency', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.findings[0]).toMatchObject({
      category: 'timeline',
      severity: 'warning',
    });
    expect(data.memory).toBeUndefined();
  });
});
