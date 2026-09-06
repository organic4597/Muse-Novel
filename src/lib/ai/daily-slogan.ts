import { generateText } from 'ai';

import { createProvider } from './provider-factory';
import { runAIRequest } from './request-scheduler';
import type { ProviderConfig } from './types';

const DAILY_SLOGAN_TIMEOUT_MS = 8000;

export const DEFAULT_DAILY_SLOGAN =
  '한 문장을 쓰는 순간, 막막하던 세계가 움직이기 시작합니다.';

export function getDailySloganDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function getEnvProviderConfig(): ProviderConfig | null {
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', modelId: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      modelId: 'claude-haiku-20240307',
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  if (process.env.NVIDIA_API_KEY) {
    return {
      provider: 'nvidia',
      modelId: process.env.NVIDIA_MODEL ?? 'meta/llama-3.1-8b-instruct',
      apiKey: process.env.NVIDIA_API_KEY,
      baseUrl: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    };
  }
  return null;
}

async function generateDailySloganRaw(today: string): Promise<string | null> {
  const config = getEnvProviderConfig();
  if (!config) return null;

  try {
    const model = createProvider(config);
    const requestSignal = AbortSignal.timeout(DAILY_SLOGAN_TIMEOUT_MS);
    const { text } = await runAIRequest(
      config,
      { priority: 'background', signal: requestSignal },
      (abortSignal) => generateText({
        abortSignal,
        maxRetries: 0,
        model,
        maxOutputTokens: 60,
        temperature: 0.9,
        timeout: DAILY_SLOGAN_TIMEOUT_MS,
        system:
          '역할: 당신은 소설가의 집필 의욕을 깨우는 한 줄 문장을 쓴다. 목표: 구체적인 이미지나 행동을 담은 15~35자의 한국어 문장 하나를 만든다. 매번 쓸 수 있는 상투적인 응원, 해시태그, 날짜, 인사말, 따옴표와 설명은 제외한다. 완성된 문장만 출력한다.',
        prompt: `${today}의 창작 문장을 새롭게 한 문장만 작성한다.`,
      })
    );
    const slogan = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^\s*["'“”‘’]+|["'“”‘’]+\s*$/g, '')
      .trim();
    return slogan || null;
  } catch (error) {
    console.warn('[daily-slogan] AI error:', error);
    return null;
  }
}

// A failed generation is cached too, so a disconnected provider cannot create
// one slow request per browser. The route serves a stable fallback in that case.
let sloganCache: { date: string; slogan: string | null } | null = null;
let sloganRequest: { date: string; promise: Promise<string | null> } | null = null;

export async function getDailySlogan(): Promise<string | null> {
  const today = getDailySloganDateKey();
  if (sloganCache?.date === today) return sloganCache.slogan;
  if (sloganRequest?.date === today) return sloganRequest.promise;

  const promise = generateDailySloganRaw(today)
    .then((slogan) => {
      sloganCache = { date: today, slogan };
      return slogan;
    })
    .finally(() => {
      if (sloganRequest?.promise === promise) sloganRequest = null;
    });

  sloganRequest = { date: today, promise };
  return promise;
}
