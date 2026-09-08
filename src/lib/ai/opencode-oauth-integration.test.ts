import path from 'node:path';
import { generateText, Output } from 'ai';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const access = `${encode({ alg: 'none' })}.${encode({ email: 'integration@example.invalid', 'https://api.openai.com/auth': { chatgpt_account_id: 'integration-account' } })}.signature`;
const answer = '{"summary":"흐름 확인","issues":[]}';
const sse = () => new Response([
  { type: 'response.output_item.added', item: { id: 'final', type: 'message', phase: 'final_answer', content: [] } },
  { type: 'response.output_text.delta', item_id: 'final', delta: answer },
  { type: 'response.output_item.done', item: { id: 'final', type: 'message', phase: 'final_answer', content: [{ type: 'output_text', text: answer, annotations: [] }] } },
  { type: 'response.completed', response: { id: 'response', model: 'gpt-5.6-luna', usage: { input_tokens: 20, output_tokens: 10 } } },
].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });

describe('OpenCode OAuth full provider path', () => {
  const authRoot = path.resolve('test-results', 'opencode-oauth-integration');
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/deviceauth/usercode')) return Response.json({ device_auth_id: 'device', user_code: 'CODE', interval: 1 });
    if (url.endsWith('/deviceauth/token')) return Response.json({ authorization_code: 'authorization', code_verifier: 'verifier' });
    if (url.endsWith('/oauth/token')) return Response.json({ id_token: access, access_token: access, refresh_token: 'refresh', expires_in: 3600 });
    if (url.includes('/backend-api/codex/responses')) return sse();
    throw new Error(`Unexpected URL: ${url} ${init?.method}`);
  });
  beforeAll(async () => {
    vi.stubEnv('MUSE_AUTH_DATA_DIR', authRoot); vi.stubEnv('ENCRYPTION_KEY', 'integration-test-key'); vi.stubGlobal('fetch', fetchMock);
    const auth = await import('./opencode-oauth'); await auth.disconnectOpenCodeOAuth(); await auth.beginOpenCodeOAuth();
    await vi.waitFor(async () => { if (!(await auth.getOpenCodeOAuthState()).connected) throw new Error('pending'); });
  });
  afterAll(async () => {
    await import('./opencode-oauth').then(module => module.disconnectOpenCodeOAuth()); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });
  it('makes a mandatory upstream stream look like structured doGenerate output', async () => {
    const { createOpenCodeOAuthProvider } = await import('./opencode-oauth-provider');
    const result = await generateText({ model: createOpenCodeOAuthProvider('gpt-5.6-luna'), prompt: '원고 흐름을 검사해줘', maxRetries: 0,
      output: Output.object({ schema: z.object({ summary: z.string(), issues: z.array(z.string()) }) }) });
    expect(result.output).toEqual({ summary: '흐름 확인', issues: [] });
    const request = fetchMock.mock.calls.find(call => String(call[0]).includes('/backend-api/codex/responses'))!;
    const body = JSON.parse(String(request[1]?.body));
    expect(body.stream).toBe(true); expect(body.text.format.type).toBe('json_schema'); expect(body.tools).toEqual([]);
  });
});
