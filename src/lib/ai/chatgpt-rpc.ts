import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, lstat, chmod } from 'node:fs/promises';
import path from 'node:path';
import { getAuthDirectory } from '@/lib/auth/storage';

type Notification = { method: string; params?: Record<string, any> };
type Pending = { resolve: (result: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export const CHATGPT_RUNTIME_VERSION = '0.153.4';
export const CHATGPT_SAFE_CONFIG = [
  'forced_login_method="chatgpt"', 'model_provider="openai"',
  'cli_auth_credentials_store="file"', 'web_search="disabled"',
  'project_doc_max_bytes=0', 'history.persistence="none"', 'analytics.enabled=false',
  ...['apps', 'plugins', 'hooks', 'shell_tool', 'unified_exec', 'multi_agent', 'computer_use', 'browser_use', 'image_generation'].map(feature => `features.${feature}=false`),
];

// No existing desktop login, API key or application secrets are inherited.
export function chatgptChildEnvironment(accountHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, CODEX_HOME: accountHome };
}

export class ChatGPTRpc {
  private child?: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(event: Notification) => void>();
  private sequence = 0;
  private buffer = '';
  private starting?: Promise<void>;
  closed = false;
  workspace = '';

  async start() {
    if (this.starting) return this.starting;
    this.starting = this.connect();
    return this.starting;
  }
  private async connect() {
    const accountHome = path.join(getAuthDirectory(), 'chatgpt');
    this.workspace = path.join(accountHome, 'workspace');
    await mkdir(this.workspace, { recursive: true, mode: 0o700 });
    for (const directory of [accountHome, this.workspace]) {
      const stat = await lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('ChatGPT 인증 저장 경로를 확인해주세요.');
      if (process.platform !== 'win32') await chmod(directory, 0o700);
    }
    const binary = process.env.MUSE_CODEX_BIN || 'codex';
    const child = spawn(binary, ['app-server', '--listen', 'stdio://', ...CHATGPT_SAFE_CONFIG.flatMap(config => ['-c', config])], {
      cwd: this.workspace, env: chatgptChildEnvironment(accountHome), windowsHide: true, stdio: 'pipe', shell: false,
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => this.consume(String(chunk)));
    // Auth URLs, tokens and prompts must never reach application diagnostics.
    child.stderr.resume();
    child.on('error', () => this.fail(new Error('Codex 실행 파일을 찾거나 실행할 수 없습니다. 서버 설치 상태를 확인해주세요.')));
    child.on('exit', () => this.fail(new Error('ChatGPT 연결 프로세스가 종료되었습니다. 다시 연결해주세요.')));
    try {
      await this.request('initialize', { clientInfo: { name: 'muse_novel', title: 'Muse Novel', version: '1.0.0' }, capabilities: { experimentalApi: true } });
      this.write({ method: 'initialized', params: {} });
    } catch (error) { this.close(); throw error; }
  }
  private write(message: unknown) {
    if (!this.child || this.closed || !this.child.stdin.writable) throw new Error('ChatGPT 연결이 닫혔습니다.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  request(method: string, params: unknown = {}, timeout = 30000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('ChatGPT 연결이 닫혔습니다.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('ChatGPT 연결 응답 시간이 초과되었습니다.')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  subscribe(listener: (event: Notification) => void) {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private consume(chunk: string) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, 'utf8') > 8_000_000) { this.fail(new Error('ChatGPT 응답이 너무 큽니다.')); return; }
    while (this.buffer.includes('\n')) {
      const end = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message: any;
      try { message = JSON.parse(line); } catch { this.fail(new Error('ChatGPT 연결 규격을 확인해주세요.')); return; }
      if (message.method && message.id !== undefined) {
        // The adapter is inference-only. Never approve filesystem, process, MCP or UI tools.
        this.write({ id: message.id, error: { code: -32601, message: 'Tools are disabled in Muse Novel inference mode.' } });
      } else if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error('Codex가 요청을 거절했습니다. 로그인 상태, 사용 한도, 모델 선택을 확인해주세요.'));
        else pending.resolve(message.result);
      } else if (typeof message.method === 'string') {
        for (const listener of this.listeners) listener(message);
      }
    }
  }
  private fail(error: Error) {
    if (this.closed) return;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.close();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.listeners) listener({ method: 'connection/closed', params: {} });
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('ChatGPT 연결이 닫혔습니다.')); }
    this.pending.clear(); this.child?.kill(); this.listeners.clear();
  }
}
