import type { LanguageModelV3, LanguageModelV3CallOptions, LanguageModelV3GenerateResult, LanguageModelV3StreamPart, LanguageModelV3Usage, SharedV3Warning } from '@ai-sdk/provider';
import { assertChatGPTNetworkAvailable, getChatGPTRpc } from './chatgpt-account';

const emptyUsage = (): LanguageModelV3Usage => ({ inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: undefined, text: undefined, reasoning: undefined } });

export function prepareChatGPTRequest(options: LanguageModelV3CallOptions) {
  if (options.tools?.length) throw new Error('ChatGPT 계정 연결은 모델 내 도구 실행을 지원하지 않습니다. 검색과 도구 실행은 Muse Novel 서버에서 수행해주세요.');
  const systems: string[] = [];
  const messages = options.prompt.map(message => {
    if (message.role === 'system') { systems.push(message.content); return null; }
    const parts = message.content.map(part => {
      if (part.type !== 'text') throw new Error('ChatGPT 계정 연결은 현재 Muse Novel의 텍스트·JSON 요청을 지원합니다. 이미지 생성·임베딩은 별도 제공자를 사용해주세요.');
      return part.text;
    });
    return { role: message.role, content: parts.join('\n') };
  }).filter(Boolean);
  const warnings: SharedV3Warning[] = [];
  for (const setting of ['temperature', 'topP', 'topK', 'presencePenalty', 'frequencyPenalty', 'seed', 'maxOutputTokens'] as const) {
    if (options[setting] !== undefined) warnings.push({ type: 'unsupported', feature: setting, details: 'Codex 계정 방식은 이 샘플링 옵션을 직접 노출하지 않습니다.' });
  }
  const json = options.responseFormat?.type === 'json';
  return {
    instructions: ['Muse Novel의 추론 전용 텍스트 생성기다. 도구·파일·명령을 사용하지 않고 제공된 요청에 대한 결과만 반환한다.', ...systems,
      ...(json ? ['유효한 JSON 값만 반환한다. 코드 울타리나 설명을 붙이지 않는다.'] : [])].join('\n\n'),
    input: `아래 메시지는 시간순 대화 기록이다. 각 role을 구별해 마지막 사용자 요청에 답하라.\n${JSON.stringify(messages)}`,
    schema: options.responseFormat?.type === 'json' ? options.responseFormat.schema : undefined, warnings,
  };
}

async function runChatGPT(modelId: string, options: LanguageModelV3CallOptions, delta: (text: string) => void): Promise<LanguageModelV3GenerateResult> {
  const prepared = prepareChatGPTRequest(options);
  await assertChatGPTNetworkAvailable(options.abortSignal);
  const rpc = await getChatGPTRpc();
  const signal = AbortSignal.any([options.abortSignal ?? new AbortController().signal, AbortSignal.timeout(600000)]);
  signal.throwIfAborted();
  const account = await rpc.request('account/read', { refreshToken: false });
  signal.throwIfAborted();
  if (account.account?.type !== 'chatgpt') throw new Error('AI 환경에서 ChatGPT 계정을 먼저 연결해주세요.');
  const started = await rpc.request('thread/start', {
    model: modelId, modelProvider: 'openai', allowProviderModelFallback: false,
    cwd: rpc.workspace, sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true,
    environments: [], dynamicTools: [], selectedCapabilityRoots: [],
    baseInstructions: prepared.instructions, developerInstructions: '서버가 전달한 텍스트만 사용한다. 응답은 최종 답변 하나이며 작업 경과나 도구 호출을 출력하지 않는다.',
  });
  const threadId: string = started.thread.id;
  let text = '';
  let usage = emptyUsage();
  let turnId: string | undefined;
  let limitReached = false;
  let textLimitReached = false;
  let emittedLength = 0;
  const stopSequences = (options.stopSequences ?? []).filter(Boolean);
  const stopHold = Math.max(0, ...stopSequences.map(stop => stop.length - 1));
  const flushText = (final: boolean) => {
    const end = final ? text.length : Math.max(0, text.length - stopHold);
    if (end > emittedLength) { delta(text.slice(emittedLength, end)); emittedLength = end; }
  };
  const phases = new Map<string, string | null>();
  const emitted = new Set<string>();
  const pendingText = new Map<string, string>();
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true; unsubscribe(); signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve();
      };
      const interrupt = () => { if (turnId) void rpc.request('turn/interrupt', { threadId, turnId }).catch(() => undefined); };
      const abort = () => { interrupt(); finish(new DOMException('ChatGPT 요청이 취소되었거나 10분을 초과했습니다.', 'AbortError')); };
      const push = (value: string) => {
        if (limitReached) return;
        const combined = text + value;
        const stops = stopSequences.map(stop => combined.indexOf(stop)).filter(index => index >= 0);
        const stop = stops.length ? Math.min(...stops) : -1;
        if (stop >= 0 || combined.length > 200000) {
          // Stop sequences are honored in the returned text, not merely as a prompt hint.
          const next = combined.slice(0, stop >= 0 ? stop : 200000);
          text = next; flushText(true); limitReached = true; textLimitReached = stop < 0; interrupt(); finish(); return;
        }
        text = combined; flushText(false);
      };
      const unsubscribe = rpc.subscribe(event => {
        const p = event.params;
        if (event.method === 'connection/closed') { finish(new Error('ChatGPT 연결이 종료되었습니다.')); return; }
        if (!p || p.threadId !== threadId) return;
        if (event.method === 'turn/started') turnId = p.turn?.id;
        if (event.method === 'item/started' && p.item?.type === 'agentMessage') phases.set(p.item.id, p.item.phase);
        if (event.method === 'item/agentMessage/delta') {
          const phase = phases.get(p.itemId);
          if (phase === 'final_answer') { emitted.add(p.itemId); push(p.delta); }
          else pendingText.set(p.itemId, (pendingText.get(p.itemId) ?? '') + p.delta);
        }
        if (event.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.phase !== 'commentary' && !emitted.has(p.item.id)) {
          push(p.item.text || pendingText.get(p.item.id) || '');
        }
        if (event.method === 'thread/tokenUsage/updated') {
          const counts = p.tokenUsage?.last;
          if (counts) usage = { inputTokens: { total: counts.inputTokens, noCache: counts.inputTokens - (counts.cachedInputTokens ?? 0), cacheRead: counts.cachedInputTokens, cacheWrite: counts.cacheWriteInputTokens },
            outputTokens: { total: counts.outputTokens, text: counts.outputTokens - (counts.reasoningOutputTokens ?? 0), reasoning: counts.reasoningOutputTokens } };
        }
        if (event.method === 'turn/completed') {
          if (p.turn?.status === 'completed') finish();
          else finish(new Error('ChatGPT 요청을 완료하지 못했습니다. 계정 한도와 선택한 모델을 확인해주세요.'));
        }
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      void rpc.request('turn/start', { threadId, input: [{ type: 'text', text: prepared.input, text_elements: [] }],
        environments: [], outputSchema: prepared.schema ?? null,
      }).then(result => { turnId = result.turn.id; if (signal.aborted) interrupt(); }).catch(error => finish(error));
    });
    if (!text.trim()) throw new Error('ChatGPT가 최종 답변을 생성하지 못했습니다.');
    if (options.responseFormat?.type === 'json') JSON.parse(text);
    flushText(true);
    return { content: [{ type: 'text', text }], usage, warnings: prepared.warnings,
      finishReason: { unified: textLimitReached ? 'length' : 'stop', raw: textLimitReached ? 'client-limit' : limitReached ? 'stop-sequence' : 'completed' } };
  } finally {
    void rpc.request('thread/unsubscribe', { threadId }, 5000).catch(() => undefined);
  }
}

export function createChatGPTProvider(modelId: string): LanguageModelV3 {
  return {
    specificationVersion: 'v3', provider: 'chatgpt', modelId, supportedUrls: {},
    doGenerate: options => runChatGPT(modelId, options, () => undefined),
    doStream: async options => {
      const cancellation = new AbortController();
      const prepared = prepareChatGPTRequest(options);
      let closed = false;
      const stream = new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          const send = (part: LanguageModelV3StreamPart) => { if (!closed) controller.enqueue(part); };
          send({ type: 'stream-start', warnings: prepared.warnings }); send({ type: 'text-start', id: 'answer' });
          void runChatGPT(modelId, { ...options, abortSignal: AbortSignal.any([cancellation.signal, options.abortSignal ?? new AbortController().signal]) }, delta => send({ type: 'text-delta', id: 'answer', delta }))
            .then(result => { send({ type: 'text-end', id: 'answer' }); send({ type: 'finish', finishReason: result.finishReason, usage: result.usage }); })
            .catch(error => send({ type: 'error', error }))
            .finally(() => { if (!closed) { closed = true; controller.close(); } });
        },
        cancel() { closed = true; cancellation.abort(); },
      });
      return { stream };
    },
  };
}
