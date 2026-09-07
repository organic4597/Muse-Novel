import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn() }));
vi.mock('@/lib/db/queries/chapters', () => ({ getChapter: vi.fn() }));
vi.mock('@/lib/ai/manuscript-critic', () => ({
  analyzeManuscript: vi.fn(),
  MANUSCRIPT_CRITIC_INTENSITIES: ['balanced', 'bold'],
}));

const chapterId = '11111111-1111-4111-8111-111111111111';

function request(body: Record<string, unknown>) {
  return new NextRequest(
    'http://localhost/api/projects/project-1/manuscript-critic',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('POST /api/projects/[id]/manuscript-critic', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getChapter } = await import('@/lib/db/queries/chapters');
    vi.mocked(getProject).mockResolvedValue({ id: 'project-1' } as never);
    vi.mocked(getChapter).mockResolvedValue({
      id: chapterId,
      projectId: 'project-1',
    } as never);
  });

  it('rejects malformed editor content before inference', async () => {
    const { analyzeManuscript } = await import('@/lib/ai/manuscript-critic');
    const { POST } = await import('./route');
    const response = await POST(
      request({ chapterId, currentContentJson: '{bad' }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(response.status).toBe(400);
    expect(analyzeManuscript).not.toHaveBeenCalled();
  });

  it('requires enough prose to review', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      request({
        chapterId,
        currentContentJson: JSON.stringify([
          { children: [{ text: '너무 짧다.' }], type: 'p' },
        ]),
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(response.status).toBe(400);
  });

  it('returns only the critic report after extracting prose', async () => {
    const { analyzeManuscript } = await import('@/lib/ai/manuscript-critic');
    vi.mocked(analyzeManuscript).mockResolvedValue({
      reviewedChars: 60,
      sceneNotes: [],
      suggestions: [],
      summary: '수정할 부분이 없습니다.',
      truncated: false,
    });
    const prose = '그는 문을 열고 안으로 들어갔다. 방 안은 조용했고 창밖에서 비가 내리고 있었다. 복도 끝에서는 낯선 발소리가 천천히 가까워지고 있었다.';
    const { POST } = await import('./route');
    const response = await POST(
      request({
        chapterId,
        currentContentJson: JSON.stringify([
          { children: [{ text: prose }], type: 'p' },
        ]),
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(response.status).toBe(200);
    expect(analyzeManuscript).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProse: prose,
        intensity: 'bold',
        projectId: 'project-1',
      })
    );
  });
});
