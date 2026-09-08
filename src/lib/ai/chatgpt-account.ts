import { ChatGPTRpc } from './chatgpt-rpc';

export type ChatGPTAccountState = {
  connected: boolean; email?: string; plan?: string; error?: string;
  models: { id: string; name: string; isDefault: boolean }[];
  login?: { verificationUrl: string; userCode: string; expiresAt: number };
};
type Login = NonNullable<ChatGPTAccountState['login']> & { id: string };
type State = { rpc?: ChatGPTRpc; login?: Login; loginTimer?: ReturnType<typeof setTimeout>; startingLogin?: Promise<void>; error?: string };
const scope = globalThis as typeof globalThis & { __museChatGPTAccount?: State };
scope.__museChatGPTAccount ??= {};
const state = scope.__museChatGPTAccount;

export class ChatGPTConnectionError extends Error {
  readonly code: 'network_challenge' | 'network_error';
  constructor(message: string, code: 'network_challenge' | 'network_error') {
    super(message);
    this.code = code;
  }
}

export async function assertChatGPTNetworkAvailable(signal?: AbortSignal) {
  try {
    const response = await fetch('https://auth.openai.com/', {
      cache: 'no-store', redirect: 'manual',
      signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(8000)]),
    });
    if (response.status === 403 && response.headers.get('cf-mitigated') === 'challenge') {
      throw new ChatGPTConnectionError(
        '운영 서버의 OpenAI 연결이 Cloudflare 보안 확인에 차단되었습니다. ChatGPT 계정이나 기기 코드 설정 문제가 아닙니다. 서버의 외부 네트워크 경로를 바꾸거나 Codex가 동작하는 장비에 추론 브리지를 구성해주세요.',
        'network_challenge'
      );
    }
  } catch (error) {
    if (error instanceof ChatGPTConnectionError) throw error;
    throw new ChatGPTConnectionError(
      '운영 서버에서 OpenAI 인증 서버에 연결할 수 없습니다. DNS·방화벽·프록시·TLS 설정을 확인해주세요.',
      'network_error'
    );
  }
}

export function getChatGPTConnectionError(error: unknown) {
  return error instanceof ChatGPTConnectionError
    ? { code: error.code, error: error.message }
    : { code: 'login_start_failed', error: 'ChatGPT 로그인을 시작하지 못했습니다. Codex 설치·서버 네트워크와 ChatGPT 보안 설정의 기기 코드 로그인을 확인해주세요.' };
}

export async function getChatGPTRpc() {
  if (!state.rpc || state.rpc.closed) {
    const rpc = new ChatGPTRpc(); state.rpc = rpc;
    rpc.subscribe(event => {
      if (event.method === 'account/login/completed') {
        clearTimeout(state.loginTimer); state.login = undefined;
        state.error = event.params?.success ? undefined : 'ChatGPT 로그인을 완료하지 못했습니다. 다시 연결해주세요.';
      }
      if (event.method === 'connection/closed') { clearTimeout(state.loginTimer); state.login = undefined; }
    });
  }
  const rpc = state.rpc;
  try { await rpc.start(); return rpc; }
  catch (error) { rpc.close(); if (state.rpc === rpc) state.rpc = undefined; throw error; }
}

export async function getChatGPTAccount(): Promise<ChatGPTAccountState> {
  try {
    const rpc = await getChatGPTRpc();
    const { account } = await rpc.request('account/read', { refreshToken: false });
    const connected = account?.type === 'chatgpt';
    const models: ChatGPTAccountState['models'] = [];
    if (connected) {
      let cursor: string | null = null;
      for (let page = 0; page < 10; page++) {
        const result = await rpc.request('model/list', { cursor, limit: 100, includeHidden: false });
        for (const model of result.data ?? []) if (!model.hidden) models.push({ id: model.model, name: model.displayName, isDefault: Boolean(model.isDefault) });
        cursor = result.nextCursor; if (!cursor) break;
      }
    }
    return { connected, ...(connected ? { email: account.email ?? undefined, plan: account.planType ?? undefined } : {}),
      models, error: state.error, ...(state.login ? { login: { verificationUrl: state.login.verificationUrl, userCode: state.login.userCode, expiresAt: state.login.expiresAt } } : {}) };
  } catch { return { connected: false, models: [], error: 'ChatGPT 연결을 확인할 수 없습니다. Codex 런타임 설치와 서버 네트워크를 확인해주세요.' }; }
}

export async function beginChatGPTLogin() {
  if (!state.startingLogin) state.startingLogin = (async () => {
    await assertChatGPTNetworkAvailable();
    const rpc = await getChatGPTRpc();
    if (state.login && state.login.expiresAt > Date.now()) return;
    const current = await rpc.request('account/read', { refreshToken: false });
    if (current.account?.type === 'chatgpt') return;
    state.error = undefined;
    const result = await rpc.request('account/login/start', { type: 'chatgptDeviceCode' });
    const url = new URL(result.verificationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com' || !result.userCode) throw new Error('공식 인증 주소를 확인하지 못했습니다.');
    state.login = { id: result.loginId, verificationUrl: url.href, userCode: result.userCode, expiresAt: Date.now() + 15 * 60000 };
    state.loginTimer = setTimeout(() => { void rpc.request('account/login/cancel', { loginId: result.loginId }).catch(() => undefined); state.login = undefined; }, 15 * 60000);
    state.loginTimer.unref();
  })().finally(() => { state.startingLogin = undefined; });
  await state.startingLogin;
  return getChatGPTAccount();
}

export async function disconnectChatGPT() {
  await state.startingLogin?.catch(() => undefined);
  const rpc = await getChatGPTRpc();
  if (state.login) await rpc.request('account/login/cancel', { loginId: state.login.id });
  await rpc.request('account/logout', {});
  clearTimeout(state.loginTimer); state.login = undefined; state.error = undefined;
  rpc.close(); state.rpc = undefined;
  return { connected: false, models: [] } satisfies ChatGPTAccountState;
}
