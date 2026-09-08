import { generateText, Output, streamText } from 'ai';
import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./opencode-oauth', () => ({ openCodeOAuthFetch: mocks.fetch }));
import { createOpenCodeOAuthProvider } from './opencode-oauth-provider';

function responsesStream(text: string) {
  const chunks = [
    { type: 'response.created', response: { id: 'response-test', created_at: 1, model: 'gpt-5.4-mini' } },
    { type: 'response.output_item.added', output_index: 0, item: { id: 'message-test', type: 'message', role: 'assistant', status: 'in_progress', content: [] } },
    ...[...text].map(delta => ({ type: 'response.output_text.delta', item_id: 'message-test', delta })),
    { type: 'response.output_item.done', output_index: 0, item: { id: 'message-test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [], logprobs: [] }] } },
    { type: 'response.completed', response: { id: 'response-test', incomplete_details: null, usage: { input_tokens: 20, input_tokens_details: { cached_tokens: 2 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 1 } }, service_tier: 'default' } },
  ];
  const body = `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
function responsesJson(text: string) {
  return Response.json({
    id: 'response-test', created_at: 1, model: 'gpt-5.4-mini',
    output: [{ type: 'message', role: 'assistant', id: 'message-test', phase: 'final_answer', content: [{ type: 'output_text', text, annotations: [], logprobs: [] }] }],
    usage: { input_tokens: 20, input_tokens_details: { cached_tokens: 2 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 1 } },
  });
}

describe('OpenCode OAuth AI SDK provider', () => {
  beforeEach(() => mocks.fetch.mockReset());
  it('streams through existing streamText callers', async () => {
    mocks.fetch.mockResolvedValue(responsesStream('이어지는 문장'));
    const result = streamText({ model: createOpenCodeOAuthProvider('gpt-5.4-mini'), prompt: '계속 써줘', maxRetries: 0 });
    let streamed = ''; for await (const delta of result.textStream) streamed += delta;
    expect(streamed).toBe('이어지는 문장'); expect(await result.text).toBe('이어지는 문장');
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it('supports existing structured Output.object requests', async () => {
    mocks.fetch.mockResolvedValue(responsesJson('{"title":"선택","beats":["행동","결과"]}'));
    const result = await generateText({ model: createOpenCodeOAuthProvider('gpt-5.4-mini'), prompt: '장면 설계', maxRetries: 0,
      output: Output.object({ schema: z.object({ title: z.string(), beats: z.array(z.string()) }) }) });
    expect(result.output).toEqual({ title: '선택', beats: ['행동', '결과'] });
    const init = mocks.fetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.text?.format?.type).toBe('json_schema');
  });
  it('forwards abort signals to the shared request path', async () => {
    const controller = new AbortController();
    mocks.fetch.mockResolvedValue(responsesStream('완료'));
    await createOpenCodeOAuthProvider('gpt-5.4-mini').doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: '중단' }] }],
      abortSignal: controller.signal,
    });
    const forwarded = (mocks.fetch.mock.calls[0][1] as RequestInit).signal;
    expect(forwarded).toBe(controller.signal);
    controller.abort(); expect(forwarded?.aborted).toBe(true);
  });
});
