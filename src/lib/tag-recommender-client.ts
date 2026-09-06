import { normalizeExternalServiceUrl } from '@/lib/external-services/client';

const DEFAULT_SERVER_URL =
  process.env.TAG_RECOMMENDER_URL ?? 'http://127.0.0.1:9877';
const REQUEST_TIMEOUT = 30_000;

export interface RecommendedTag {
  tag: string;
  category: string;
  categoryLabel: string;
  color: string;
  reason: string;
  score: number;
}

function resolveServerUrl(baseUrl?: string): string {
  return normalizeExternalServiceUrl(baseUrl || DEFAULT_SERVER_URL);
}

export async function recommendTags(
  texts: Record<string, string>,
  options?: {
    topK?: number;
    threshold?: number;
    excludeCategories?: string[];
    autoSplit?: boolean;
    translate?: boolean;
  },
  baseUrl?: string
): Promise<RecommendedTag[]> {
  const response = await fetch(`${resolveServerUrl(baseUrl)}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      texts,
      topK: options?.topK ?? 30,
      threshold: options?.threshold ?? 0.25,
      excludeCategories: options?.excludeCategories ?? ['artist'],
      autoSplit: options?.autoSplit ?? true,
      translate: options?.translate ?? true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`태그 추천 API 응답 오류: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { tags?: RecommendedTag[] };
  return data.tags ?? [];
}

export async function translateTexts(
  texts: string[],
  baseUrl?: string
): Promise<string[]> {
  const response = await fetch(`${resolveServerUrl(baseUrl)}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`태그 번역 API 응답 오류: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { translations?: string[] };
  return data.translations ?? texts;
}
