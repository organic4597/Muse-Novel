import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProvider: vi.fn(),
  generateText: vi.fn(),
  getDefaultProvider: vi.fn(),
  getProject: vi.fn(),
  getProviderOptions: vi.fn(),
  isAIRequestQueueFullError: vi.fn(),
  resolveStoredProviderConfig: vi.fn(),
  runAIRequest: vi.fn(),
  schedulerSignal: new AbortController().signal,
  updateProject: vi.fn(),
}));

vi.mock('ai', () => ({ generateText: mocks.generateText }));
vi.mock('@/lib/ai/daily-slogan', () => ({
  getEnvProviderConfig: vi.fn(() => null),
}));
vi.mock('@/lib/ai/encryption', () => ({ decryptApiKey: vi.fn() }));
vi.mock('@/lib/ai/provider-config-resolver', () => ({
  resolveStoredProviderConfig: mocks.resolveStoredProviderConfig,
}));
vi.mock('@/lib/ai/provider-factory', () => ({
  createProvider: mocks.createProvider,
}));
vi.mock('@/lib/ai/provider-options', () => ({
  getProviderOptions: mocks.getProviderOptions,
}));
vi.mock('@/lib/ai/request-scheduler', () => ({
  isAIRequestQueueFullError: mocks.isAIRequestQueueFullError,
  runAIRequest: mocks.runAIRequest,
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/ai-settings', () => ({
  getDefaultProvider: mocks.getDefaultProvider,
}));
vi.mock('@/lib/db/queries/projects', () => ({
  getProject: mocks.getProject,
  updateProject: mocks.updateProject,
}));

function createRequest() {
  return new NextRequest(
    'http://localhost:3000/api/projects/project-1/style/analyze',
    {
      body: JSON.stringify({ sampleText: '비가 내렸다. 골목은 고요했다.' }),
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'style-request-1',
      },
      method: 'POST',
    }
  );
}

describe('POST /api/projects/[id]/style/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getDefaultProvider.mockResolvedValue({ providerType: 'qwen-local' });
    mocks.resolveStoredProviderConfig.mockReturnValue({
      modelId: 'local-model',
      provider: 'qwen-local',
    });
    mocks.createProvider.mockReturnValue('test-model');
    mocks.getProviderOptions.mockReturnValue({ qwenLocal: {} });
    mocks.generateText.mockResolvedValue({ text: '짧고 건조한 문장을 사용한다.' });
    mocks.isAIRequestQueueFullError.mockReturnValue(false);
    mocks.runAIRequest.mockImplementation(
      (
        _config: unknown,
        _options: unknown,
        run: (signal: AbortSignal) => Promise<unknown>
      ) => run(mocks.schedulerSignal)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('schedules local style analysis at standard priority with cancellation metadata', async () => {
    const request = createRequest();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const { POST } = await import('./route');

    const response = await POST(request, {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      description: '짧고 건조한 문장을 사용한다.',
    });
    expect(mocks.runAIRequest).toHaveBeenCalledWith(
      { modelId: 'local-model', provider: 'qwen-local' },
      {
        priority: 'standard',
        projectId: 'project-1',
        requestId: 'style-request-1',
        signal: expect.any(AbortSignal),
      },
      expect.any(Function)
    );
    expect(timeoutSpy).toHaveBeenCalledWith(600_000);
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: mocks.schedulerSignal,
        maxOutputTokens: 200,
      })
    );
    expect(mocks.updateProject).toHaveBeenCalledWith(
      {},
      'project-1',
      expect.objectContaining({
        writingStyleDescription: '짧고 건조한 문장을 사용한다.',
      })
    );
  });

  it('returns retry metadata when the local queue is full', async () => {
    const queueError = Object.assign(new Error('queue full'), {
      code: 'AI_QUEUE_FULL',
      retryAfterSeconds: 9,
    });
    mocks.runAIRequest.mockRejectedValue(queueError);
    mocks.isAIRequestQueueFullError.mockReturnValue(true);
    const { POST } = await import('./route');

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'project-1' }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('9');
    await expect(response.json()).resolves.toEqual({
      code: 'ai_queue_full',
      error: 'queue full',
    });
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });
});
