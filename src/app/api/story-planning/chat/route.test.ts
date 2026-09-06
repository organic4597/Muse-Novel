import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIRequestQueueFullError } from '@/lib/ai/request-scheduler';
import { researchForRequest } from '@/lib/web-research/research';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/ai-settings');
vi.mock('@/lib/ai/daily-slogan');
vi.mock('@/lib/ai/provider-factory');
vi.mock('@/lib/ai/provider-options');
vi.mock('ai');
vi.mock('@/lib/web-research/research', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/web-research/research')>(),
  researchForRequest: vi.fn(),
}));

const configuredProvider = {
  providerType: 'openai-compatible',
  modelName: 'local-story-model',
  apiKeyEncrypted: null,
  baseUrl: 'http://127.0.0.1:8080/v1',
  contextSize: 32_768,
};

function createRequest(body: Record<string, unknown>, accept?: string) {
  return new NextRequest('http://localhost/api/story-planning/chat', {
    method: 'POST',
    headers: {
      ...(accept ? { Accept: accept } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function draft(currentPhase: string) {
  return { characters: [], worldEntries: [], currentPhase };
}

describe('POST /api/story-planning/chat', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(researchForRequest).mockResolvedValue({ status: 'skipped', queries: [], sources: [] });
    const { getGlobalDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { createProvider } = await import('@/lib/ai/provider-factory');
    const { getProviderOptions } = await import('@/lib/ai/provider-options');

    vi.mocked(getGlobalDefaultProvider).mockResolvedValue(configuredProvider as never);
    vi.mocked(createProvider).mockReturnValue({ modelId: 'local-story-model' } as never);
    vi.mocked(getProviderOptions).mockReturnValue(undefined);
  });

  it('rejects malformed requests before calling the model', async () => {
    const { generateText } = await import('ai');
    const { POST } = await import('./route');

    const response = await POST(createRequest({ messages: [] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
    expect(generateText).not.toHaveBeenCalled();
  });

  it('removes the legacy sea-temple artifact even if the model emits it again', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        reply: '잊혀진 바다신전을 세계관에 추가했어요.',
        draft: {
          ...draft('world'),
          worldEntries: [
            {
              category: '장소',
              title: '잊혀진 바다신전',
              content: '자동으로 만든 설정',
            },
          ],
        },
      }),
    } as never);
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      messages: [{ role: 'user', content: '도시의 생활 규칙을 정해보자.' }],
      draft: draft('world'),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('잊혀진 바다신전');
    expect(body.draft.worldEntries).toEqual([]);
    expect(body.draft.pendingWorldEntries).toBeUndefined();
  });

  it('does not skip an incomplete phase because the model advanced prematurely', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        reply: '세계관 단계로 넘어가겠습니다.',
        draft: draft('world'),
      }),
    } as never);
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      messages: [{ role: 'user', content: '주인공 성격부터 더 고민하자.' }],
      draft: draft('characters'),
    }));
    const body = await response.json();

    expect(body.draft.currentPhase).toBe('characters');
  });

  it('replaces a repetitive reply without forcing another phase', async () => {
    const { generateText } = await import('ai');
    const repeated = '주인공의 이름과 성격을 구체적으로 정해볼까요? 먼저 이름부터 알려주세요.';
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        reply: repeated,
        draft: draft('characters'),
      }),
    } as never);
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      messages: [
        { role: 'assistant', content: repeated, draftSnapshot: draft('characters') },
        { role: 'user', content: '성격은 냉정하지만 약자에게는 다정해.' },
      ],
      draft: draft('characters'),
    }));
    const body = await response.json();

    expect(body.draft.currentPhase).toBe('characters');
    expect(body.reply).not.toBe(repeated);
  });

  it('streams reply text before returning the repaired draft', async () => {
    vi.mocked(researchForRequest).mockResolvedValue({ status: 'searched', queries: ['소림사 역사'], sources: [
      { id: '웹1', title: '소림사 역사', url: 'https://example.org/shaolin', snippet: '검색으로 찾은 소림사 역사 자료.' },
    ] });
    const { generateText, streamText } = await import('ai');
    const rawText = JSON.stringify({
      reply: '토끼의 다음 선택을 정해볼게요.\n\n**중반부**부터 이어갑니다.',
      draft: draft('characters'),
      options: ['동료 추가하기'],
    });

    async function* fullStream() {
      for (const text of [rawText.slice(0, 28), rawText.slice(28, 55), rawText.slice(55)]) {
        yield { id: 'story', text, type: 'text-delta' };
      }
      yield { finishReason: 'stop', type: 'finish' };
    }

    vi.mocked(streamText).mockReturnValue({ fullStream: fullStream() } as never);
    const { POST } = await import('./route');
    const response = await POST(createRequest({
      messages: [{ role: 'user', content: '중반부 사건을 이어서 정하자.' }],
      draft: draft('characters'),
    }, 'text/event-stream'));
    const streamBody = await response.text();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(streamBody).toContain('event: delta');
    expect(streamBody).toContain('event: done');
    expect(streamBody).toContain('토끼의 다음 선택');
    expect(streamBody).toContain('https://example.org/shaolin');
    expect(JSON.stringify(vi.mocked(streamText).mock.calls[0][0].messages)).toContain('검색으로 찾은 소림사 역사 자료');
    expect(streamBody).not.toContain('<think>');
    expect(generateText).not.toHaveBeenCalled();
  });

  it('keeps the local-model lease until the full response stream is consumed', async () => {
    const { getGlobalDefaultProvider } = await import('@/lib/db/queries/ai-settings');
    const { streamText } = await import('ai');
    vi.mocked(getGlobalDefaultProvider).mockResolvedValue({
      ...configuredProvider,
      providerType: 'qwen-local',
    } as never);

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const rawText = JSON.stringify({
      draft: draft('characters'),
      reply: '첫 번째 응답',
    });

    async function* firstFullStream() {
      yield { id: 'first', text: rawText, type: 'text-delta' };
      await firstGate;
      yield { finishReason: 'stop', type: 'finish' };
    }

    async function* secondFullStream() {
      yield { id: 'second', text: rawText, type: 'text-delta' };
      yield { finishReason: 'stop', type: 'finish' };
    }

    vi.mocked(streamText)
      .mockReturnValueOnce({ fullStream: firstFullStream() } as never)
      .mockReturnValueOnce({ fullStream: secondFullStream() } as never);

    const { POST } = await import('./route');
    const requestBody = {
      draft: draft('characters'),
      messages: [{ role: 'user', content: '다음 설정을 정하자.' }],
    };
    const firstResponse = await POST(createRequest(requestBody, 'text/event-stream'));
    const firstBody = firstResponse.text();
    await vi.waitFor(() => expect(streamText).toHaveBeenCalledTimes(1));

    const secondResponse = await POST(createRequest(requestBody, 'text/event-stream'));
    const secondBody = secondResponse.text();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(streamText).toHaveBeenCalledTimes(1);

    releaseFirst();
    await expect(firstBody).resolves.toContain('event: done');
    await expect(secondBody).resolves.toContain('다른 AI 작업이 끝나기를 기다리는 중');
    expect(streamText).toHaveBeenCalledTimes(2);
  });

  it('keeps an incomplete plot in the plot phase and preserves a useful fallback reply', async () => {
    const { generateText } = await import('ai');
    const usefulReply = '아직 2막 이후가 비어 있으니 중반 전환점과 최종 위기를 먼저 연결하겠습니다.';
    vi.mocked(generateText).mockResolvedValue({
      text: `{"reply":"${usefulReply}","draft":{"currentPhase":"writing_setup","plotStructure":"1막은 소림으로 이동. 2막 이후 미정."`,
    } as never);
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      messages: [{
        role: 'user',
        content: '일단 아직 중반까지의 스토리 흐름만 작성한 상태야 다음으로 설정해야할건?',
      }],
      draft: {
        ...draft('plot'),
        endingDirection: '소림의 명예장로가 된다',
        firstChapterOutline: '무인들이 바위산을 수색한다',
        plotStructure: '1막은 소림으로 이동. 2막 이후 미정.',
      },
    }));
    const body = await response.json();

    expect(body.draft.currentPhase).toBe('plot');
    expect(body.reply).toBe(usefulReply);
    expect(body.reply).not.toContain('방금 말한');
  });

  it('rejects length-truncated model output instead of saving partial settings', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({
      finishReason: 'length',
      text: '{"reply":"정리했습니다.","draft":{"storyPromise":"마지막에는 \'아,',
    } as never);
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      messages: [{ role: 'user', content: '기획을 완성해줘.' }],
      draft: draft('complete'),
    }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('output_truncated');
    expect(body.message).toContain('설정에 반영하지 않았습니다');
  });

  it('maps local queue overload to 429 with Retry-After', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValue(new AIRequestQueueFullError(11));
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      messages: [{ role: 'user', content: '기획을 계속해줘.' }],
      draft: draft('plot'),
    }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('11');
    expect(body).toMatchObject({
      error: 'ai_queue_full',
      retryAfterSeconds: 11,
    });
  });
});
