import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  project: vi.fn(), note: vi.fn(), provider: vi.fn(), get: vi.fn(), plan: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: mocks.project }));
vi.mock('@/lib/db/queries/author-notebook', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/db/queries/author-notebook')>(), getAuthorNote: mocks.note,
}));
vi.mock('@/lib/db/queries/storyline-chat', () => ({ getStorylineConversation: mocks.get }));
vi.mock('@/lib/ai/resolve-project-provider', () => ({ resolveProjectProvider: mocks.provider }));
vi.mock('@/lib/ai/storyline-assistant', () => ({ planStorylineNoteEdits: mocks.plan }));

import { POST } from './route';
import { readLongTask } from '@/lib/client/long-task';

describe('storyline note edit plan route', () => {
  const messageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const context = { params: Promise.resolve({ id: 'project', noteId: 'note' }) };
  const request = (body: unknown) => new Request('http://localhost/api/projects/project/author-notes/note/chat/edit-plan', {
    method: 'POST', body: JSON.stringify(body),
  });
  const plan = { summary: '소속 변경', edits: [{ original: '개방', replacement: '소림', reason: '작가 요청' }], addition: '', warnings: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({ id: 'project' });
    mocks.note.mockReturnValue({ kind: 'text', contentJson: '{"text":"소속: 개방"}' });
    mocks.get.mockReturnValue({ revision: 4, messages: [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'user', text: '소속을 소림으로 바꿔줘.' },
      { id: messageId, role: 'assistant', text: '소림 소속으로 변경하겠습니다.' },
    ] });
    mocks.provider.mockResolvedValue({ provider: 'qwen-local', modelId: 'general-instruct' });
    mocks.plan.mockResolvedValue(plan);
  });

  it('builds but does not directly apply an edit plan from server-owned note data', async () => {
    const result = await readLongTask(await POST(request({ messageId, revision: 4 }), context), vi.fn());
    expect(result).toEqual(plan);
    expect(mocks.plan.mock.calls[0][0]).toMatchObject({
      projectId: 'project', question: '소속을 소림으로 바꿔줘.', answer: '소림 소속으로 변경하겠습니다.', note: '소속: 개방',
    });
  });

  it('rejects stale conversation state before asking the model', async () => {
    expect((await POST(request({ messageId, revision: 3 }), context)).status).toBe(409);
    expect(mocks.plan).not.toHaveBeenCalled();
  });
});
