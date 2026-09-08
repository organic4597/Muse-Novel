import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), listener: undefined as undefined | ((event: any) => void), close: vi.fn() }));
vi.mock('./chatgpt-rpc', () => ({ ChatGPTRpc: class {
  closed = false; start = async () => {}; request = mocks.request;
  subscribe(listener: (event: any) => void) { mocks.listener = listener; return () => {}; }
  close() { this.closed = true; mocks.close(); }
} }));

describe('isolated ChatGPT account lifecycle', () => {
  beforeEach(() => {
    vi.resetModules(); (globalThis as any).__museChatGPTAccount = undefined;
    mocks.request.mockReset(); mocks.close.mockClear();
    mocks.request.mockImplementation(async method => {
      if (method === 'account/read') return { account: null };
      if (method === 'account/login/start') return { type: 'chatgptDeviceCode', loginId: 'private-login-id', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-1234', accessToken: 'fixture-never-expose' };
      return {};
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  });
  afterEach(async () => { await (await import('./chatgpt-account')).disconnectChatGPT(); vi.unstubAllGlobals(); });
  it('does not expose internal auth tokens or login identifiers and reuses a pending login', async () => {
    const account = await import('./chatgpt-account');
    const first = await account.beginChatGPTLogin();
    await account.beginChatGPTLogin();
    expect(first.login?.userCode).toBe('TEST-1234');
    expect(JSON.stringify(first)).not.toContain('fixture-never-expose');
    expect(JSON.stringify(first)).not.toContain('private-login-id');
    expect(mocks.request.mock.calls.filter(call => call[0] === 'account/login/start')).toHaveLength(1);
    expect(mocks.request.mock.calls.find(call => call[0] === 'account/login/start')![1]).toEqual({ type: 'chatgptDeviceCode' });
  });
  it('publishes account metadata and only models returned by Codex after login', async () => {
    mocks.request.mockImplementation(async method => method === 'account/read'
      ? { account: { type: 'chatgpt', email: 'test@example.invalid', planType: 'plus', token: 'hidden' } }
      : { data: [{ model: 'entitled-model', displayName: 'Model', hidden: false, isDefault: true }], nextCursor: null });
    const result = await (await import('./chatgpt-account')).getChatGPTAccount();
    expect(result).toMatchObject({ connected: true, email: 'test@example.invalid', models: [{ id: 'entitled-model', name: 'Model', isDefault: true }] });
    expect(JSON.stringify(result)).not.toContain('hidden');
  });
  it('rejects a non-official device authentication URL', async () => {
    mocks.request.mockImplementation(async method => method === 'account/read' ? { account: null } : { verificationUrl: 'https://example.invalid/sign-in', userCode: 'code' });
    await expect((await import('./chatgpt-account')).beginChatGPTLogin()).rejects.toThrow('공식 인증 주소');
  });
  it('reports a Cloudflare network challenge before starting or exposing device login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } })));
    const account = await import('./chatgpt-account');
    await expect(account.beginChatGPTLogin()).rejects.toMatchObject({ code: 'network_challenge' });
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
