import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { getAuthDirectory } from '@/lib/auth/storage';
import { decryptApiKey, encryptApiKey } from './encryption';
import type { OpenCodeOAuthState } from './opencode-oauth-types';

/**
 * Adapted from OpenCode's built-in OpenAI Codex OAuth plugin.
 * Source: anomalyco/opencode@d6855b6b47a8433462ac6aeeba882ccf734cb7f1
 * Original: packages/opencode/src/plugin/openai/codex.ts
 * Copyright (c) 2025 opencode, used under the MIT License.
 */
export const OPENCODE_OAUTH_SOURCE = 'd6855b6b47a8433462ac6aeeba882ccf734cb7f1';
export const OPENCODE_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const OPENCODE_OAUTH_ISSUER = 'https://auth.openai.com';
export const OPENCODE_CODEX_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
export const OPENCODE_COMPAT_VERSION = '1.18.29';
export const OPENCODE_OAUTH_MODELS = [
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', isDefault: true },
  { id: 'gpt-5.4', name: 'GPT-5.4', isDefault: false },
  { id: 'gpt-5.5', name: 'GPT-5.5', isDefault: false },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', isDefault: false },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', isDefault: false },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', isDefault: false },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra', isDefault: false },
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', isDefault: false },
] as const;

const encryptedCredentialSchema = z.object({
  version: z.literal(1),
  access: z.string().max(20_000),
  refresh: z.string().max(20_000),
  accountId: z.string().max(4000),
  expiresAt: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});
const tokenResponseSchema = z.object({
  id_token: z.string().min(1).max(20_000),
  access_token: z.string().min(1).max(20_000),
  refresh_token: z.string().min(1).max(20_000),
  expires_in: z.number().int().positive().max(31_536_000).optional(),
});
const deviceCodeSchema = z.object({
  device_auth_id: z.string().min(1).max(1000),
  user_code: z.string().min(1).max(100),
  interval: z.union([z.string(), z.number()]).transform(value => Number(value)),
});
const deviceTokenSchema = z.object({
  authorization_code: z.string().min(1).max(4000),
  code_verifier: z.string().min(1).max(4000),
});
type PlainCredential = { access: string; refresh: string; accountId: string; expiresAt: number; email?: string };
type PendingLogin = { abort: AbortController; deviceAuthId: string; userCode: string; intervalMs: number; expiresAt: number };
type OAuthRuntime = { pending?: PendingLogin; error?: string; refresh?: Promise<PlainCredential> };
const globalRuntime = globalThis as typeof globalThis & { __museOpenCodeOAuth?: OAuthRuntime };
globalRuntime.__museOpenCodeOAuth ??= {};
const runtime = globalRuntime.__museOpenCodeOAuth;

function oauthDirectory() { return path.join(getAuthDirectory(), 'opencode-oauth'); }
function credentialPath() { return path.join(oauthDirectory(), 'credential.json'); }
function authUserAgent() { return `opencode/${OPENCODE_COMPAT_VERSION}`; }
function inferenceUserAgent() { return `${authUserAgent()} (${os.platform()} ${os.release()}; ${os.arch()})`; }

function jwtClaims(token: string): Record<string, unknown> | undefined {
  const pieces = token.split('.');
  if (pieces.length !== 3 || !pieces[1]) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch { return undefined; }
}
function claimString(value: unknown, max = 500) { return typeof value === 'string' && value.length <= max ? value : undefined; }
function tokenIdentity(tokens: z.infer<typeof tokenResponseSchema>) {
  const claims = jwtClaims(tokens.id_token) ?? jwtClaims(tokens.access_token) ?? {};
  const nested = claims['https://api.openai.com/auth'];
  const auth = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested as Record<string, unknown> : {};
  const organizations = Array.isArray(claims.organizations) ? claims.organizations : [];
  const firstOrganization = organizations[0] && typeof organizations[0] === 'object' ? organizations[0] as Record<string, unknown> : {};
  return {
    accountId: claimString(claims.chatgpt_account_id, 1000) ?? claimString(auth.chatgpt_account_id, 1000) ?? claimString(firstOrganization.id, 1000),
    email: claimString(claims.email),
  };
}
export function extractOpenCodeResidency(accessToken: string) {
  const claims = jwtClaims(accessToken) ?? {};
  const nested = claims['https://api.openai.com/auth'];
  const auth = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested as Record<string, unknown> : {};
  const value = claimString(auth.chatgpt_compute_residency, 100) ?? claimString(claims.chatgpt_compute_residency, 100);
  return value && value !== 'no_constraint' && /^[a-z0-9_-]{1,100}$/iu.test(value) ? value : undefined;
}

async function ensureDirectory() {
  const directory = oauthDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('OAuth 인증 저장 경로가 안전하지 않습니다.');
  if (process.platform !== 'win32') await chmod(directory, 0o700);
}
async function writeCredential(credential: PlainCredential) {
  await ensureDirectory();
  const target = credentialPath();
  const temporary = `${target}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const serialized = JSON.stringify({
    version: 1, access: encryptApiKey(credential.access), refresh: encryptApiKey(credential.refresh),
    accountId: encryptApiKey(credential.accountId), expiresAt: credential.expiresAt, updatedAt: new Date().toISOString(),
  });
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(serialized, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, target); if (process.platform !== 'win32') await chmod(target, 0o600); }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
}
export async function readOpenCodeCredential(): Promise<PlainCredential | null> {
  try {
    const target = credentialPath();
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64_000) return null;
    if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) await chmod(target, 0o600);
    const stored = encryptedCredentialSchema.parse(JSON.parse(await readFile(target, 'utf8')));
    const access = decryptApiKey(stored.access); const refresh = decryptApiKey(stored.refresh); const accountId = decryptApiKey(stored.accountId);
    if (!access || !refresh || !accountId) return null;
    return { access, refresh, accountId, expiresAt: stored.expiresAt, email: claimString(jwtClaims(access)?.email) };
  } catch { return null; }
}

async function requestTokens(body: URLSearchParams, signal?: AbortSignal) {
  const response = await fetch(`${OPENCODE_OAUTH_ISSUER}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': authUserAgent() }, body,
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(30_000)]),
  });
  if (!response.ok) throw new Error(`OAuth 토큰 요청 실패 (${response.status})`);
  return tokenResponseSchema.parse(await response.json());
}
function toCredential(tokens: z.infer<typeof tokenResponseSchema>, previousAccountId?: string): PlainCredential {
  const identity = tokenIdentity(tokens);
  const accountId = identity.accountId ?? previousAccountId;
  if (!accountId) throw new Error('ChatGPT 계정 식별자를 확인하지 못했습니다.');
  return { access: tokens.access_token, refresh: tokens.refresh_token, accountId,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000, email: identity.email };
}
export async function getValidOpenCodeCredential(signal?: AbortSignal) {
  const credential = await readOpenCodeCredential();
  if (!credential) throw new Error('OpenCode 방식으로 ChatGPT 계정을 먼저 연결해주세요.');
  if (credential.expiresAt > Date.now() + 60_000) return credential;
  runtime.refresh ??= (async () => {
    const tokens = await requestTokens(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credential.refresh, client_id: OPENCODE_OAUTH_CLIENT_ID }), signal);
    const refreshed = toCredential(tokens, credential.accountId); await writeCredential(refreshed); return refreshed;
  })().finally(() => { runtime.refresh = undefined; });
  return runtime.refresh;
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
async function pollLogin(login: PendingLogin) {
  try {
    while (!login.abort.signal.aborted && Date.now() < login.expiresAt) {
      const response = await fetch(`${OPENCODE_OAUTH_ISSUER}/api/accounts/deviceauth/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': authUserAgent() },
        body: JSON.stringify({ device_auth_id: login.deviceAuthId, user_code: login.userCode }),
        signal: AbortSignal.any([login.abort.signal, AbortSignal.timeout(30_000)]),
      });
      if (response.ok) {
        const data = deviceTokenSchema.parse(await response.json());
        const tokens = await requestTokens(new URLSearchParams({ grant_type: 'authorization_code', code: data.authorization_code,
          redirect_uri: `${OPENCODE_OAUTH_ISSUER}/deviceauth/callback`, client_id: OPENCODE_OAUTH_CLIENT_ID, code_verifier: data.code_verifier }), login.abort.signal);
        await writeCredential(toCredential(tokens)); runtime.error = undefined; runtime.pending = undefined; return;
      }
      if (response.status !== 403 && response.status !== 404) throw new Error(`기기 인증 확인 실패 (${response.status})`);
      await abortableDelay(login.intervalMs + 3000, login.abort.signal);
    }
    if (!login.abort.signal.aborted) throw new Error('로그인 코드가 만료되었습니다. 다시 연결해주세요.');
  } catch (error) {
    if (!login.abort.signal.aborted) runtime.error = error instanceof Error ? error.message : 'ChatGPT 로그인을 완료하지 못했습니다.';
    runtime.pending = undefined;
  }
}
export async function beginOpenCodeOAuth(): Promise<OpenCodeOAuthState> {
  if (await readOpenCodeCredential()) return getOpenCodeOAuthState();
  if (!runtime.pending) {
    const response = await fetch(`${OPENCODE_OAUTH_ISSUER}/api/accounts/deviceauth/usercode`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': authUserAgent() },
      body: JSON.stringify({ client_id: OPENCODE_OAUTH_CLIENT_ID }), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OpenCode 방식의 기기 코드 발급 실패 (${response.status})`);
    const data = deviceCodeSchema.parse(await response.json());
    if (!Number.isFinite(data.interval)) throw new Error('기기 코드 응답 형식이 올바르지 않습니다.');
    runtime.pending = { abort: new AbortController(), deviceAuthId: data.device_auth_id, userCode: data.user_code,
      intervalMs: Math.max(1000, Math.min(30_000, data.interval * 1000)), expiresAt: Date.now() + 15 * 60_000 };
    runtime.error = undefined; void pollLogin(runtime.pending);
  }
  return getOpenCodeOAuthState();
}
export async function getOpenCodeOAuthState(): Promise<OpenCodeOAuthState> {
  const credential = await readOpenCodeCredential();
  return { connected: Boolean(credential), email: credential?.email, error: runtime.error,
    models: OPENCODE_OAUTH_MODELS.map(model => ({ ...model })),
    ...(runtime.pending ? { login: { userCode: runtime.pending.userCode, verificationUrl: `${OPENCODE_OAUTH_ISSUER}/codex/device`, expiresAt: runtime.pending.expiresAt } } : {}) };
}
export async function disconnectOpenCodeOAuth() {
  runtime.pending?.abort.abort(); runtime.pending = undefined; runtime.error = undefined;
  await unlink(credentialPath()).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
  return getOpenCodeOAuthState();
}

export async function openCodeOAuthFetch(input: RequestInfo | URL, init?: RequestInit) {
  const parsed = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
  if (!parsed.pathname.includes('/responses') && !parsed.pathname.includes('/chat/completions')) {
    throw new Error('OpenCode OAuth 제공자는 텍스트 추론 요청만 허용합니다.');
  }
  const credential = await getValidOpenCodeCredential(init?.signal ?? undefined);
  const headers = new Headers(init?.headers);
  headers.delete('authorization'); headers.delete('Authorization'); headers.delete('x-api-key');
  headers.set('authorization', `Bearer ${credential.access}`);
  headers.set('ChatGPT-Account-Id', credential.accountId);
  headers.set('originator', 'opencode'); headers.set('User-Agent', inferenceUserAgent()); headers.set('session-id', crypto.randomUUID());
  const residency = extractOpenCodeResidency(credential.access);
  if (residency) headers.set('x-openai-internal-codex-residency', residency);
  let body = init?.body;
  if (typeof body === 'string') {
    const requestBody = JSON.parse(body) as Record<string, unknown>;
    if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) throw new Error('OpenCode OAuth에서는 모델 도구 실행을 허용하지 않습니다.');
    requestBody.max_output_tokens = undefined;
    requestBody.tools = [];
    requestBody.store = false;
    requestBody.parallel_tool_calls = false;
    body = JSON.stringify(requestBody);
  }
  return fetch(OPENCODE_CODEX_ENDPOINT, { ...init, body, headers });
}
