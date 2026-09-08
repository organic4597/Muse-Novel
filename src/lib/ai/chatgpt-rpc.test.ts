import { describe, expect, it, vi } from 'vitest';
import { ChatGPTRpc, chatgptChildEnvironment, CHATGPT_SAFE_CONFIG } from './chatgpt-rpc';
describe('ChatGPT runtime isolation', () => {
  it('does not inherit API credentials, app secrets, or the desktop Codex home', () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key'); vi.stubEnv('MUSE_AUTH_SETUP_TOKEN', 'test-setup'); vi.stubEnv('CODEX_HOME', '/desktop-profile');
    try {
      const env = chatgptChildEnvironment('/isolated-profile');
      expect(env.CODEX_HOME).toBe('/isolated-profile');
      expect(env.OPENAI_API_KEY).toBeUndefined(); expect(env.MUSE_AUTH_SETUP_TOKEN).toBeUndefined();
    } finally { vi.unstubAllEnvs(); }
  });
  it('explicitly disables execution, browser, plugin and external tool sources', () => {
    for (const feature of ['shell_tool', 'unified_exec', 'apps', 'plugins', 'hooks', 'multi_agent', 'computer_use', 'browser_use', 'image_generation']) {
      expect(CHATGPT_SAFE_CONFIG).toContain(`features.${feature}=false`);
    }
    expect(CHATGPT_SAFE_CONFIG).toContain('forced_login_method="chatgpt"');
    expect(CHATGPT_SAFE_CONFIG).toContain('project_doc_max_bytes=0');
    expect(CHATGPT_SAFE_CONFIG).toContain('web_search="disabled"');
  });
  it('rejects server-requested tools instead of executing or approving them', () => {
    const rpc = new ChatGPTRpc();
    const write = vi.fn();
    (rpc as any).child = { stdin: { writable: true, write }, kill: vi.fn() };
    (rpc as any).consume(JSON.stringify({ id: 42, method: 'item/commandExecution/requestApproval', params: { command: 'do not execute' } }) + '\n');
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({ id: 42, error: { code: -32601 } });
    rpc.close();
  });
  it('routes fragmented RPC replies and rejects outstanding calls when disconnected', async () => {
    const rpc = new ChatGPTRpc(); const write = vi.fn(); const closed = vi.fn();
    (rpc as any).child = { stdin: { writable: true, write }, kill: vi.fn() };
    rpc.subscribe(closed);
    const first = rpc.request('account/read');
    const id = JSON.parse(write.mock.calls[0][0]).id;
    (rpc as any).consume(`{"id":${id},"result":`);
    (rpc as any).consume('{"account":null}}\n');
    expect(await first).toEqual({ account: null });
    const pending = rpc.request('model/list'); const rejected = expect(pending).rejects.toThrow('닫혔습니다');
    rpc.close(); await rejected;
    expect(closed).toHaveBeenCalledWith({ method: 'connection/closed', params: {} });
  });
});
