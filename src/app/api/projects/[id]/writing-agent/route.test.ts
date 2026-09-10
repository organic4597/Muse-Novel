import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn() }));
vi.mock('@/lib/db/queries/chapters', () => ({ getChapter: vi.fn() }));
vi.mock('@/lib/ai/writing-agent', () => ({ runWritingAgent: vi.fn() }));

const chapterId = '11111111-1111-4111-8111-111111111111';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/projects/project-1/writing-agent', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

describe('POST /api/projects/[id]/writing-agent', () => {
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

  it('validates short instructions', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ instruction: 'x' }), {
      params: Promise.resolve({ id: 'project-1' }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects malformed current editor JSON before starting AI work', async () => {
    const { runWritingAgent } = await import('@/lib/ai/writing-agent');
    const { POST } = await import('./route');
    const response = await POST(
      request({
        chapterId,
        currentContentJson: '{bad',
        instruction: '다음 장면을 써줘',
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );
    expect(response.status).toBe(400);
    expect(runWritingAgent).not.toHaveBeenCalled();
  });

  it('streams progress, prose deltas and completion metadata', async () => {
    const { runWritingAgent } = await import('@/lib/ai/writing-agent');
    vi.mocked(runWritingAgent).mockImplementation(async (options) => {
      options.onProgress?.({ message: '계획 중', stage: 'plan' });
      options.onDelta?.('완성 문장');
      return {
        critique: '반복을 줄인다.',
        draft: '초안',
        index: {},
        knowledgeMatches: [],
        memoryMode: 'keyword',
        plan: '장면 계획',
        text: '완성 문장',
      } as never;
    });
    const { POST } = await import('./route');
    const response = await POST(
      request({
        chapterId,
        currentContentJson: JSON.stringify([
          { children: [{ text: '이전 원고' }], type: 'p' },
        ]),
        cursorAfter: '커서 뒤 원고',
        cursorBefore: '커서 앞 원고',
        continuationText: '아직 삽입하지 않은 생성 원고',
        instruction: '다음 대치 장면을 써줘',
        review: true,
        targetLength: 1200,
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );
    const body = await response.text();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(body).toContain('event: progress');
    expect(body).toContain('event: delta');
    expect(body).toContain('event: done');
    expect(body).toContain('완성 문장');
    expect(runWritingAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        currentProse: '이전 원고',
        cursorAfter: '커서 뒤 원고',
        cursorBefore: '커서 앞 원고',
        pendingDraft: '아직 삽입하지 않은 생성 원고',
        review: true,
      })
    );
  });

  it('aborts the agent signal when the response consumer cancels', async () => {
    const { runWritingAgent } = await import('@/lib/ai/writing-agent');
    let observedSignal: AbortSignal | undefined;
    vi.mocked(runWritingAgent).mockImplementation(
      (options) =>
        new Promise((_, reject) => {
          observedSignal = options.signal;
          options.onProgress?.({ message: '준비 중', stage: 'memory' });
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true }
          );
        })
    );
    const { POST } = await import('./route');
    const response = await POST(
      request({ chapterId, instruction: '다음 장면을 써줘' }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader?.read();
    await reader?.cancel();

    await vi.waitFor(() => expect(observedSignal?.aborted).toBe(true));
  });
});
