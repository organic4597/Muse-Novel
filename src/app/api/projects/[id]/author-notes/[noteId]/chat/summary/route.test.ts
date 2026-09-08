import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  project: vi.fn(), note: vi.fn(), provider: vi.fn(), get: vi.fn(), summarize: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: mocks.project }));
vi.mock('@/lib/db/queries/author-notebook', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/db/queries/author-notebook')>(), getAuthorNote: mocks.note,
}));
vi.mock('@/lib/db/queries/storyline-chat', () => ({ getStorylineConversation: mocks.get }));
vi.mock('@/lib/ai/resolve-project-provider', () => ({ resolveProjectProvider: mocks.provider }));
vi.mock('@/lib/ai/storyline-assistant', () => ({ summarizeStorylineForNote: mocks.summarize }));

import { POST } from './route';
import { readLongTask } from '@/lib/client/long-task';

describe('storyline note summary route', () => {
  const messageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const context = { params: Promise.resolve({ id: 'project', noteId: 'note' }) };
  const request = (body: unknown) => new Request('http://localhost/api/projects/project/author-notes/note/chat/summary', {
    method: 'POST', body: JSON.stringify(body),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({ id: 'project' });
    mocks.note.mockReturnValue({ kind: 'text', contentJson: '{"text":"기존 구상"}' });
    mocks.get.mockReturnValue({ revision: 3, messages: [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'user', text: '이 방향은 어때?' },
      { id: messageId, role: 'assistant', text: '두 가지 방향을 제안합니다.' },
    ] });
    mocks.provider.mockResolvedValue({ provider: 'qwen-local', modelId: 'general-instruct' });
    mocks.summarize.mockResolvedValue('## 핵심 정리');
  });

  it('summarizes the selected answer with its question and the current saved note', async () => {
    const response = await POST(request({ messageId, revision: 3 }), context);
    const result = await readLongTask<{ text: string }>(response, vi.fn());
    expect(result).toEqual({ text: '## 핵심 정리' });
    expect(mocks.summarize.mock.calls[0][0]).toMatchObject({
      projectId: 'project', question: '이 방향은 어때?', answer: '두 가지 방향을 제안합니다.',
      note: '기존 구상', config: { modelId: 'general-instruct' },
    });
  });

  it('rejects stale conversations and unknown or non-assistant messages before inference', async () => {
    expect((await POST(request({ messageId, revision: 2 }), context)).status).toBe(409);
    expect((await POST(request({ messageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', revision: 3 }), context)).status).toBe(404);
    expect((await POST(request({ messageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', revision: 3 }), context)).status).toBe(404);
    expect(mocks.summarize).not.toHaveBeenCalled();
  });
});
