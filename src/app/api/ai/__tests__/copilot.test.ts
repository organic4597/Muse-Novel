import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects');
vi.mock('@/lib/db/queries/ai-settings');
vi.mock('@/lib/db/queries/ghost-ai-settings');
vi.mock('@/lib/ai/provider-factory');
vi.mock('@/lib/db/queries/writing-style-profiles');
vi.mock('ai');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/ai/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockProject = {
  id: 'project-1',
  title: '테스트 소설',
  genre: '판타지',
  synopsis: '용사의 모험',
  settingsJson: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockProviderSettings = {
  id: 'provider-1',
  projectId: 'project-1',
  providerType: 'openai',
  modelName: 'gpt-4o-mini',
  apiKeyEncrypted: 'enc-key',
  baseUrl: null,
  isDefault: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockModel = { modelId: 'gpt-4o-mini', provider: 'openai' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/ai/copilot', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getGhostAISettings } = await import(
      '@/lib/db/queries/ghost-ai-settings'
    );
    vi.mocked(getGhostAISettings).mockResolvedValue(undefined);
  });

  it('returns 400 when projectId is missing from request body', async () => {
    const { POST } = await import('../copilot/route');

    const req = createRequest({ prompt: '계속 이어서 써줘' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('projectId is required');
  });

  it('returns empty text when project is not found', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    vi.mocked(getProject).mockResolvedValue(undefined);

    const { POST } = await import('../copilot/route');

    const req = createRequest({ projectId: 'non-existent', prompt: '다음 문장' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ text: '' });
  });

  it('returns empty text when no default AI provider is configured', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(undefined);

    const { POST } = await import('../copilot/route');

    const req = createRequest({ projectId: 'project-1', prompt: '다음 문장' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ text: '' });
  });

  it('returns generated text on normal flow', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const { generateText } = await import('ai');

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(mockProviderSettings);
    vi.mocked(createProvider).mockReturnValue(mockModel as never);
    vi.mocked(generateText).mockResolvedValue({ text: '다음 문장입니다.' } as never);

    const { POST } = await import('../copilot/route');

    const req = createRequest({ projectId: 'project-1', prompt: '그는 조용히' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('다음 문장입니다.');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses prefix and suffix for inline suggestions and normalizes the result', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const { generateText } = await import('ai');

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(mockProviderSettings);
    vi.mocked(createProvider).mockReturnValue(mockModel as never);
    vi.mocked(generateText).mockResolvedValue({
      text: '다음 문장: 차가운 바람이 얼굴을 스쳤다.',
    } as never);

    const { POST } = await import('../copilot/route');
    const req = createRequest({
      mode: 'inline-suggestion',
      trigger: 'explicit',
      projectId: 'project-1',
      prefix: '그녀는 문을 열었다.',
      suffix: '복도 끝에서 발소리가 들렸다.',
      prompt: '그녀는 문을 열었다.',
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.text).toBe(' 차가운 바람이 얼굴을 스쳤다.');
    const call = vi.mocked(generateText).mock.calls.at(-1)?.[0];
    expect(call?.prompt).toContain('<CURSOR>');
    expect(call?.prompt).toContain('복도 끝에서 발소리가 들렸다.');
    expect(call?.temperature).toBe(0.55);
  });

  it('uses the local model chat template for qwen-local inline suggestions', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          { message: { content: '차가운 바람이 젖은 털을 스쳤다.' } },
        ],
      })
    );

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue({
      ...mockProviderSettings,
      providerType: 'qwen-local',
      modelName: 'Kanana-2-30B-A3B-Instruct-2601',
      baseUrl: 'http://127.0.0.1:8080/v1',
    });
    vi.mocked(createProvider).mockReturnValue(mockModel as never);
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('../copilot/route');
    const req = createRequest({
      mode: 'inline-suggestion',
      trigger: 'explicit',
      projectId: 'project-1',
      prefix: '검은 토끼는 고개를 들었다.',
      suffix: '멀리서 종소리가 울렸다.',
      prompt: '검은 토끼는 고개를 들었다.',
    });
    const res = await POST(req);
    const body = await res.json();

    expect(body.text).toBe(' 차가운 바람이 젖은 털을 스쳤다.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:8080/v1/chat/completions'
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload).toEqual(
      expect.objectContaining({
        chat_template_kwargs: { enable_thinking: false },
        model: 'Kanana-2-30B-A3B-Instruct-2601',
      })
    );
    expect(payload.messages).toEqual([
      expect.objectContaining({ role: 'system' }),
      expect.objectContaining({ role: 'user' }),
    ]);
    expect(payload.messages[1].content).toContain('<CURSOR>');
    expect(payload.messages[1].content).toContain('멀리서 종소리가 울렸다.');
  });

  it('prefers a project Ghost provider only for inline suggestions', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { getGhostAISettings } = await import(
      '@/lib/db/queries/ghost-ai-settings'
    );
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: '토끼의 귀가 가늘게 떨렸다.' } }],
      })
    );

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(mockProviderSettings);
    vi.mocked(getGhostAISettings).mockResolvedValue({
      projectId: 'project-1',
      providerType: 'qwen-local',
      modelName: 'Kanana-Ghost',
      baseUrl: 'http://ghost-model:8080',
      apiKeyEncrypted: null,
      contextSize: 32768,
      createdAt: new Date(),
      updatedAt: new Date('2026-09-07T00:00:00Z'),
    });
    vi.mocked(createProvider).mockReturnValue(mockModel as never);
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('../copilot/route');
    const response = await POST(
      createRequest({
        mode: 'inline-suggestion',
        trigger: 'explicit',
        projectId: 'project-1',
        prefix: '검은 토끼는 숨을 죽였다.',
        suffix: '',
      })
    );

    expect((await response.json()).text).toBe(' 토끼의 귀가 가늘게 떨렸다.');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://ghost-model:8080/v1/chat/completions'
    );
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)
    );
    expect(body.model).toBe('Kanana-Ghost');
  });

  it('returns empty text (not 500) when AI generation throws an error', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const { generateText } = await import('ai');

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(mockProviderSettings);
    vi.mocked(createProvider).mockReturnValue(mockModel as never);
    vi.mocked(generateText).mockRejectedValue(new Error('API rate limit exceeded'));

    const { POST } = await import('../copilot/route');

    const req = createRequest({ projectId: 'project-1', prompt: '그는 조용히' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ text: '' });
  });

  it('returns 408 when request is aborted (AbortError)', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const { generateText } = await import('ai');

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(mockProviderSettings);
    vi.mocked(createProvider).mockReturnValue(mockModel as never);

    const abortError = new Error('Request aborted');
    abortError.name = 'AbortError';
    vi.mocked(generateText).mockRejectedValue(abortError);

    const { POST } = await import('../copilot/route');

    const req = createRequest({ projectId: 'project-1', prompt: '그는 조용히' });
    const res = await POST(req);

    expect(res.status).toBe(408);
  });

  it('calls generateText with correct parameters including project system prompt', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const { generateText } = await import('ai');

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(mockProviderSettings);
    vi.mocked(createProvider).mockReturnValue(mockModel as never);
    vi.mocked(generateText).mockResolvedValue({ text: '모험이 시작됩니다.' } as never);

    const { POST } = await import('../copilot/route');

    const req = createRequest({ projectId: 'project-1', prompt: '그는 조용히' });
    await POST(req);

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: mockModel,
        prompt: '그는 조용히',
        maxOutputTokens: 20,
        temperature: 0.7,
      })
    );

    // System prompt should contain project info (Korean)
    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.system).toContain('테스트 소설');
  });

  it('appends client-provided system prompt to the generated system prompt', async () => {
    const { getProject } = await import('@/lib/db/queries/projects');
    const { getDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const { generateText } = await import('ai');

    vi.mocked(getProject).mockResolvedValue(mockProject);
    vi.mocked(getDefaultProvider).mockResolvedValue(mockProviderSettings);
    vi.mocked(createProvider).mockReturnValue(mockModel as never);
    vi.mocked(generateText).mockResolvedValue({ text: '응답' } as never);

    const { POST } = await import('../copilot/route');

    const req = createRequest({
      projectId: 'project-1',
      prompt: '그는',
      system: '추가 지시사항',
    });
    await POST(req);

    const callArgs = vi.mocked(generateText).mock.calls[0][0];
    expect(callArgs.system).toContain('추가 지시사항');
    expect(callArgs.system).toContain('테스트 소설');
  });
});
