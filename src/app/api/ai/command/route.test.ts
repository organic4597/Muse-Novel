import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('platejs', () => ({
  createSlateEditor: vi.fn(() => ({
    api: { isExpanded: () => false },
  })),
}));
vi.mock('@/components/editor/editor-base-kit', () => ({ BaseEditorKit: [] }));
vi.mock('@/lib/ai/build-story-context', () => ({
  buildStoryContext: vi.fn(async () => ''),
}));
vi.mock('@/lib/ai/daily-slogan', () => ({
  getEnvProviderConfig: vi.fn(() => ({
    baseUrl: 'http://127.0.0.1:8321',
    modelId: 'local-model',
    provider: 'qwen-local',
  })),
}));
vi.mock('@/lib/ai/encryption', () => ({ decryptApiKey: vi.fn() }));
vi.mock('@/lib/ai/prompt-foundations', () => ({
  buildEditorAssistantSystemPrompt: vi.fn(() => 'system'),
}));
vi.mock('@/lib/ai/provider-config-resolver', () => ({
  resolveStoredProviderConfig: vi.fn(),
}));
vi.mock('@/lib/ai/provider-factory', () => ({
  createProvider: vi.fn(() => ({ modelId: 'local-model' })),
}));
vi.mock('@/lib/ai/provider-options', () => ({
  getProviderOptions: vi.fn(() => undefined),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/ai-settings', () => ({
  getDefaultProvider: vi.fn(),
  getGlobalDefaultProvider: vi.fn(),
}));
vi.mock('@/lib/knowledge/writing-knowledge', () => ({
  buildWritingKnowledgeContextFromDocuments: vi.fn(() => ''),
  getWritingKnowledgeDocument: vi.fn(),
  runWritingKnowledgeAgent: vi.fn(() => ({ context: '' })),
}));
vi.mock('@/lib/markdown-joiner-transform', () => ({
  markdownJoinerTransform: vi.fn(),
}));
vi.mock('./prompts', () => ({
  getEditPrompt: vi.fn(() => 'edit'),
  getGeneratePrompt: vi.fn(() => 'generate'),
}));
vi.mock('./utils', () => ({ getTextFromMessage: vi.fn(() => '') }));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: vi.fn() };
});

function createRequest(signal?: AbortSignal) {
  return new NextRequest('http://localhost/api/ai/command', {
    body: JSON.stringify({
      ctx: {
        children: [],
        selection: null,
        toolName: 'generate',
      },
      messages: [],
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });
}

function completedUIStream(text: string) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ id: 'text', type: 'text-start' });
      controller.enqueue({ delta: text, id: 'text', type: 'text-delta' });
      controller.enqueue({ id: 'text', type: 'text-end' });
      controller.close();
    },
  });
}

function streamResult(stream: ReadableStream) {
  return {
    toUIMessageStream: vi.fn(() => stream),
  } as never;
}

describe.sequential('POST /api/ai/command scheduler integration', () => {
  beforeEach(async () => {
    const { streamText } = await import('ai');
    vi.mocked(streamText).mockReset();
  });

  it('holds the local-model lease until every UI stream chunk is consumed', async () => {
    const { streamText } = await import('ai');
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStream = new ReadableStream({
      async start(controller) {
        controller.enqueue({ id: 'first', type: 'text-start' });
        controller.enqueue({ delta: '첫 응답', id: 'first', type: 'text-delta' });
        await firstGate;
        controller.enqueue({ id: 'first', type: 'text-end' });
        controller.close();
      },
    });

    vi.mocked(streamText)
      .mockReturnValueOnce(streamResult(firstStream))
      .mockReturnValueOnce(streamResult(completedUIStream('둘째 응답')));
    const { POST } = await import('./route');

    const firstResponse = await POST(createRequest());
    const firstBody = firstResponse.text();
    await vi.waitFor(() => expect(streamText).toHaveBeenCalledTimes(1));

    const secondResponse = await POST(createRequest());
    const secondBody = secondResponse.text();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(streamText).toHaveBeenCalledTimes(1);

    releaseFirst();
    await expect(firstBody).resolves.toContain('첫 응답');
    await expect(secondBody).resolves.toContain('둘째 응답');
    expect(streamText).toHaveBeenCalledTimes(2);
  });

  it('surfaces bounded-queue overload as a safe UI stream error', async () => {
    const { streamText } = await import('ai');
    const { aiRequestScheduler } = await import('@/lib/ai/request-scheduler');
    let releaseActive!: () => void;
    const activeGate = new Promise<void>((resolve) => {
      releaseActive = resolve;
    });
    const activeStream = new ReadableStream({
      async start(controller) {
        controller.enqueue({ id: 'active', type: 'text-start' });
        await activeGate;
        controller.enqueue({ id: 'active', type: 'text-end' });
        controller.close();
      },
    });

    vi.mocked(streamText)
      .mockReturnValueOnce(streamResult(activeStream))
      .mockImplementation(() => streamResult(completedUIStream('대기 요청')));
    const { POST } = await import('./route');

    const activeResponse = await POST(createRequest());
    const activeBody = activeResponse.text();
    await vi.waitFor(() => expect(streamText).toHaveBeenCalledTimes(1));
    const queuedBodies: Promise<string>[] = [];
    for (let index = 0; index < aiRequestScheduler.maxQueueSize; index++) {
      const queuedResponse = await POST(createRequest());
      queuedBodies.push(queuedResponse.text());
    }
    const overloadedResponse = await POST(createRequest());
    const overloadedBody = await overloadedResponse.text();

    expect(overloadedBody).toContain('로컬 AI 요청이 너무 많이 대기 중입니다');
    expect(overloadedBody).not.toContain('AI_QUEUE_FULL');
    expect(streamText).toHaveBeenCalledTimes(1);

    releaseActive();
    await activeBody;
    await Promise.all(queuedBodies);
    expect(streamText).toHaveBeenCalledTimes(
      aiRequestScheduler.maxQueueSize + 1
    );
  });

  it('surfaces request cancellation as a safe UI stream error', async () => {
    const { streamText } = await import('ai');
    const requestController = new AbortController();
    requestController.abort();
    const { POST } = await import('./route');

    const response = await POST(createRequest(requestController.signal));
    const body = await response.text();

    expect(body).toContain('AI 요청이 취소되었거나 응답 시간이 초과되었습니다');
    expect(streamText).not.toHaveBeenCalled();
  });
});
