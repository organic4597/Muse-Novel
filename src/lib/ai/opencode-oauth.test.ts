import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
}
const access = jwt({ email: 'writer@example.invalid', 'https://api.openai.com/auth': { chatgpt_account_id: 'account-test', chatgpt_compute_residency: 'kr' } });
const tokens = (expires = 3600) => ({ id_token: access, access_token: access, refresh_token: 'refresh-plain-secret', expires_in: expires });

describe('OpenCode-compatible OAuth module', () => {
  const authRoot = path.resolve('test-results', 'opencode-oauth-test');
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('MUSE_AUTH_DATA_DIR', authRoot);
    vi.stubEnv('ENCRYPTION_KEY', 'opencode-oauth-unit-test-only');
    await import('./opencode-oauth').then(module => module.disconnectOpenCodeOAuth());
  });
  afterEach(async () => {
    await import('./opencode-oauth').then(module => module.disconnectOpenCodeOAuth());
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
  });
  function loginFetch(expires = 3600) {
    return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/deviceauth/usercode')) return Response.json({ device_auth_id: 'device-id', user_code: 'TEST-CODE', interval: '1' });
      if (url.endsWith('/deviceauth/token')) return Response.json({ authorization_code: 'authorization-code', code_verifier: 'verifier' });
      if (url.endsWith('/oauth/token')) return Response.json(tokens(expires));
      return Response.json({ ok: true });
    });
  }
  async function login(fetchMock = loginFetch()) {
    vi.stubGlobal('fetch', fetchMock);
    const module = await import('./opencode-oauth');
    const started = await module.beginOpenCodeOAuth();
    await vi.waitFor(async () => {
      if (!(await module.getOpenCodeOAuthState()).connected) throw new Error('OAuth polling has not completed');
    });
    return { module, fetchMock, started };
  }
  it('uses the OpenCode device flow and stores encrypted, permission-limited credentials', async () => {
    const { fetchMock, started } = await login();
    expect(started.login).toMatchObject({ userCode: 'TEST-CODE', verificationUrl: 'https://auth.openai.com/codex/device' });
    const calls = fetchMock.mock.calls;
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ client_id: 'app_EMoamEEZ73f0CkXaXp7hrann' });
    expect(new Headers(calls[0][1]?.headers).get('User-Agent')).toBe('opencode/1.18.29');
    const exchange = new URLSearchParams(String(calls[2][1]?.body));
    expect(exchange.get('grant_type')).toBe('authorization_code');
    expect(exchange.get('redirect_uri')).toBe('https://auth.openai.com/deviceauth/callback');
    const file = path.join(authRoot, 'opencode-oauth', 'credential.json');
    const stored = await readFile(file, 'utf8');
    expect(stored).not.toContain(access); expect(stored).not.toContain('refresh-plain-secret'); expect(stored).toContain('v2:');
  });
  it('refreshes one time for concurrent requests and rotates the stored token', async () => {
    const fetchMock = loginFetch(1); const { module } = await login(fetchMock);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 2000);
    fetchMock.mockImplementation(async input => String(input).endsWith('/oauth/token')
      ? Response.json({ ...tokens(), refresh_token: 'rotated-refresh-secret' }) : Response.json({ ok: true }));
    const before = fetchMock.mock.calls.length;
    const [left, right] = await Promise.all([module.getValidOpenCodeCredential(), module.getValidOpenCodeCredential()]);
    expect(left.refresh).toBe('rotated-refresh-secret'); expect(right.refresh).toBe('rotated-refresh-secret');
    expect(fetchMock.mock.calls.slice(before).filter(call => String(call[0]).endsWith('/oauth/token'))).toHaveLength(1);
  });
  it('rewrites only inference requests with OAuth identity and blocks model tools', async () => {
    const { module } = await login();
    const inference = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ok: true })); vi.stubGlobal('fetch', inference);
    await module.openCodeOAuthFetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: 'Bearer dummy' },
      body: JSON.stringify({ model: 'gpt-5.4-mini', input: 'test', max_output_tokens: 200 }),
    });
    expect(inference.mock.calls[0][0]).toBe('https://chatgpt.com/backend-api/codex/responses');
    const init = inference.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${access}`);
    expect(headers.get('ChatGPT-Account-Id')).toBe('account-test');
    expect(headers.get('originator')).toBe('opencode');
    expect(headers.get('x-openai-internal-codex-residency')).toBe('kr');
    expect(JSON.parse(String(init.body))).not.toHaveProperty('max_output_tokens');
    await expect(module.openCodeOAuthFetch('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ tools: [{ type: 'function' }] }) })).rejects.toThrow('도구');
    await expect(module.openCodeOAuthFetch('https://api.openai.com/v1/models')).rejects.toThrow('텍스트 추론');
  });
  it('deletes only the Muse-owned encrypted credential on disconnect', async () => {
    const { module } = await login();
    expect((await module.disconnectOpenCodeOAuth()).connected).toBe(false);
    expect(await module.readOpenCodeCredential()).toBeNull();
  });
});
