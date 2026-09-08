import type { ProviderType } from './types';
import { getChatGPTAccount } from './chatgpt-account';

const TIMEOUT_MS = 10_000;

export type HealthCheckResult = {
  status: 'ok' | 'error' | 'warn';
  message: string;
  models?: string[];
};

type HealthCheckOptions = {
  baseUrl?: string;
  apiKey?: string;
};

function makeSignal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

function networkErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `연결할 수 없습니다: ${message}`;
}

async function checkOllama(baseUrl: string): Promise<HealthCheckResult> {
  const url = `${baseUrl}/api/tags`;
  try {
    const res = await fetch(url, { signal: makeSignal() });
    if (!res.ok) {
      return { status: 'error', message: `서버 응답 오류: ${res.status}` };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    return { status: 'ok', message: '연결됨', models };
  } catch (err) {
    return { status: 'error', message: networkErrorMessage(err) };
  }
}

async function checkCompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<HealthCheckResult> {
  const url = `${baseUrl}/models`;
  try {
    const res = await fetch(url, {
      signal: makeSignal(),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!res.ok) {
      return { status: 'error', message: `서버 응답 오류: ${res.status}` };
    }
    const data = (await res.json()) as { data?: { id: string }[] };
    const models = (data.data ?? []).map((m) => m.id);
    return { status: 'ok', message: '연결됨', models };
  } catch (err) {
    return { status: 'error', message: networkErrorMessage(err) };
  }
}

async function checkOpenAI(apiKey: string): Promise<HealthCheckResult> {
  const url = 'https://api.openai.com/v1/models';
  try {
    const res = await fetch(url, {
      signal: makeSignal(),
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) {
      return { status: 'error', message: `서버 응답 오류: ${res.status}` };
    }
    return { status: 'ok', message: '연결됨' };
  } catch (err) {
    return { status: 'error', message: networkErrorMessage(err) };
  }
}

async function checkAnthropic(apiKey: string): Promise<HealthCheckResult> {
  const url = 'https://api.anthropic.com/v1/messages';
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: makeSignal(),
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'test',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
    });
    if (!res.ok) {
      return { status: 'error', message: `서버 응답 오류: ${res.status}` };
    }
    return { status: 'ok', message: '연결됨' };
  } catch (err) {
    return { status: 'error', message: networkErrorMessage(err) };
  }
}

/**
 * Performs a health check for the given AI provider.
 *
 * Returns `{ status: 'ok' | 'error' | 'warn', message: string, models?: string[] }`.
 * For Ollama, `models` is populated from the `/api/tags` response.
 */
export async function checkProviderHealth(
  providerType: ProviderType,
  options: HealthCheckOptions
): Promise<HealthCheckResult> {
  const { baseUrl = '', apiKey = '' } = options;

  switch (providerType) {
    case 'chatgpt': {
      const account = await getChatGPTAccount();
      return { status: account.connected ? 'ok' : 'error', message: account.connected ? 'ChatGPT 계정 연결됨' : account.error || 'ChatGPT 계정을 먼저 연결해주세요.', models: account.models.map(model => model.id) };
    }
    case 'openai-compatible': {
      if (!baseUrl.trim()) return { status: 'error', message: 'API Base URL을 입력해주세요.' };
      const normalized = baseUrl.trim().replace(/\/+$/, '');
      return checkCompatibleModels(normalized.endsWith('/v1') ? normalized : `${normalized}/v1`, apiKey);
    }
    case 'ollama':
      return checkOllama(baseUrl);
    case 'nvidia':
      return checkCompatibleModels(baseUrl, apiKey);
    case 'openai':
      return checkOpenAI(apiKey);
    case 'anthropic':
      return checkAnthropic(apiKey);
    case 'koboldcpp':
      return { status: 'ok', message: 'KoboldCpp (OpenAI 호환)' };
    case 'qwen-local': {
      try {
        const res = await fetch(`${baseUrl || 'http://127.0.0.1:8321'}/health`, {
          cache: 'no-store',
          signal: makeSignal(),
        });
        if (res.ok) return { status: 'ok', message: 'Qwen Local 서버 연결됨' };
        return { status: 'error', message: `Qwen Local 서버 응답 오류: ${res.status}` };
      } catch (err) {
        return { status: 'error', message: networkErrorMessage(err) };
      }
    }
    default: {
      const _exhaustive: never = providerType;
      return {
        status: 'error',
        message: `알 수 없는 제공자: ${_exhaustive}`,
      };
    }
  }
}
