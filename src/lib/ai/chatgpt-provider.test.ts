import { generateText, streamText, Output } from 'ai';
import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listeners: new Set<(event: any) => void>(), request: vi.fn(), auth: 'chatgpt', text: '자연스러운 다음 문장입니다.', auto: true, count: 0 }));
vi.mock('./chatgpt-account', () => ({ getChatGPTRpc: async () => ({ workspace: '/isolated', request: mocks.request, subscribe: (listener: (event: any) => void) => { mocks.listeners.add(listener); return () => mocks.listeners.delete(listener); } }) }));
import { createChatGPTProvider, prepareChatGPTRequest } from './chatgpt-provider';
const emit = (method: string, params: any) => { for (const listener of [...mocks.listeners]) listener({ method, params }); };
describe('ChatGPT AI SDK compatibility', () => {
  beforeEach(() => {
    mocks.listeners.clear(); mocks.auth = 'chatgpt'; mocks.auto = true; mocks.text = '자연스러운 다음 문장입니다.'; mocks.count = 0;
    mocks.request.mockReset().mockImplementation(async (method, params) => {
      if (method === 'account/read') return { account: { type: mocks.auth } };
      if (method === 'thread/start') return { thread: { id: `thread-${++mocks.count}` } };
      if (method === 'turn/start') {
        const threadId = params.threadId;
        emit('turn/started', { threadId, turn: { id: `turn-${threadId}` } });
        if (mocks.auto) queueMicrotask(() => {
          emit('item/started', { threadId, item: { type: 'agentMessage', id: 'commentary', phase: 'commentary' } });
          emit('item/agentMessage/delta', { threadId, itemId: 'commentary', delta: '숨겨야 할 작업 경과' });
          emit('item/started', { threadId, item: { type: 'agentMessage', id: 'final', phase: 'final_answer' } });
          for (const delta of mocks.text) emit('item/agentMessage/delta', { threadId, itemId: 'final', delta });
          emit('item/completed', { threadId, item: { type: 'agentMessage', id: 'final', phase: 'final_answer', text: mocks.text } });
          emit('thread/tokenUsage/updated', { threadId, tokenUsage: { last: { inputTokens: 100, cachedInputTokens: 10, outputTokens: 20, reasoningOutputTokens: 5 } } });
          emit('turn/completed', { threadId, turn: { status: 'completed' } });
        });
        return { turn: { id: `turn-${threadId}` } };
      }
      return {};
    });
  });
  it('works with existing generateText callers without API keys or inherited tools', async () => {
    const result = await generateText({ model: createChatGPTProvider('selected-model'), system: '작품 설정', prompt: '이어 써줘', maxRetries: 0 });
    expect(result.text).toBe(mocks.text);
    expect(result.usage.inputTokens).toBe(100);
    const start = mocks.request.mock.calls.find(call => call[0] === 'thread/start')![1];
    expect(start).toMatchObject({ model: 'selected-model', sandbox: 'read-only', ephemeral: true, environments: [], dynamicTools: [], selectedCapabilityRoots: [], allowProviderModelFallback: false });
    expect(start.baseInstructions).toContain('작품 설정');
  });
  it('supports Output.object through the same SDK API and forwards JSON schema', async () => {
    mocks.text = '{"title":"다음 장면","beats":["선택","결과"]}';
    const result = await generateText({ model: createChatGPTProvider('selected-model'), prompt: '구상', maxRetries: 0,
      output: Output.object({ schema: z.object({ title: z.string(), beats: z.array(z.string()) }) }) });
    expect(result.output).toEqual({ title: '다음 장면', beats: ['선택', '결과'] });
    expect(mocks.request.mock.calls.find(call => call[0] === 'turn/start')![1].outputSchema.properties.title.type).toBe('string');
  });
  it('streams final text once and removes a stop sequence split across chunks', async () => {
    mocks.text = '본문<END>노출 금지';
    const result = streamText({ model: createChatGPTProvider('selected-model'), prompt: '작성', stopSequences: ['<END>'], maxRetries: 0 });
    let text = ''; for await (const delta of result.textStream) text += delta;
    expect(text).toBe('본문'); expect(await result.text).toBe('본문');
    expect(mocks.request.mock.calls.some(call => call[0] === 'turn/interrupt')).toBe(true);
  });
  it('interrupts a live turn on abort and releases listeners', async () => {
    mocks.auto = false;
    const controller = new AbortController();
    const pending = createChatGPTProvider('selected-model').doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: '질문' }] }], abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(mocks.request.mock.calls.some(call => call[0] === 'turn/start')).toBe(true));
    controller.abort(); await rejected;
    expect(mocks.request.mock.calls.some(call => call[0] === 'turn/interrupt')).toBe(true);
    expect(mocks.listeners.size).toBe(0);
  });
  it('does not silently switch an API-key session into subscription usage', async () => {
    mocks.auth = 'apiKey';
    await expect(generateText({ model: createChatGPTProvider('selected-model'), prompt: '질문', maxRetries: 0 })).rejects.toThrow('먼저 연결');
    expect(mocks.request.mock.calls.some(call => call[0] === 'turn/start')).toBe(false);
  });
  it('reports unsupported settings and rejects new model-side tool execution', () => {
    const prepared = prepareChatGPTRequest({ prompt: [], temperature: .5, maxOutputTokens: 100 });
    expect(prepared.warnings.map(warning => 'feature' in warning && warning.feature)).toEqual(['temperature', 'maxOutputTokens']);
    expect(() => prepareChatGPTRequest({ prompt: [], tools: [{ type: 'function', name: 'exec', inputSchema: {} }] })).toThrow('도구');
  });
});
