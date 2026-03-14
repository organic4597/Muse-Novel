import { generateText } from 'ai';

import { createProvider } from './provider-factory';
import type { ProviderConfig } from './types';

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

async function generateDailySloganRaw(): Promise<string | null> {
  const config = getEnvProviderConfig();
  if (!config) return null;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const model = createProvider(config);
    const { text } = await generateText({
      model,
      maxOutputTokens: 60,
      temperature: 0.9,
      system:
        '당신은 소설 작가를 위한 영감을 주는 슬로건 생성기입니다. 간결하고 감성적인 한 문장으로 창작 의욕을 불러일으키는 슬로건을 만드세요.',
      prompt: `오늘(${today})을 위한 소설 작가를 위한 창작 슬로건을 한 문장으로 만들어주세요. 따옴표 없이 슬로건만 출력하세요.`,
    });
    return text.trim() || null;
  } catch (error) {
    console.warn('[daily-slogan] AI error:', error);
    return null;
  }
}

// In-memory cache: only stores successful results, keyed by date
let _sloganCache: { date: string; slogan: string } | null = null;

export async function getDailySlogan(): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  // Return cached value if from today
  if (_sloganCache?.date === today) return _sloganCache.slogan;
  const result = await generateDailySloganRaw();
  if (result) _sloganCache = { date: today, slogan: result };
  return result;
}
