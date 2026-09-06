import type { WebSource } from './types';

const CACHE_TTL = 5 * 60_000;
const cache = new Map<string, { expires: number; sources: WebSource[] }>();
let activeSearches = 0;

export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':') ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(hostname)) return null;
    return url.href;
  } catch { return null; }
}

function plainText(value: unknown, limit: number) {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (entity) =>
      ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity] ?? ' '
    ).replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

async function readBoundedJson(response: Response) {
  if (!response.body) throw new Error('검색 응답이 비어 있습니다.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512_000) throw new Error('검색 응답이 너무 큽니다.');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as { results?: unknown[] };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Fetch only the configured search API. Returned page URLs are never fetched. */
export async function searchWeb(baseUrl: string, query: string, signal?: AbortSignal): Promise<WebSource[]> {
  signal?.throwIfAborted();
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('검색 API 주소를 확인해주세요.');
  }
  const key = `${base.href}\n${query}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.sources;
  if (activeSearches >= 2) throw new Error('다른 웹 검색을 처리하고 있습니다. 잠시 후 다시 시도해주세요.');
  activeSearches += 1;
  try {
    const endpoint = `${base.href.replace(/\/$/, '')}/search`;
    const language = /[가-힣]/u.test(query) ? 'ko-KR' : /\p{Script=Han}/u.test(query) ? 'zh-CN' : 'en';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ q: query, format: 'json', categories: 'general', language }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(12_000)]),
    });
    if (!response.ok) throw new Error(`검색 API 응답 오류 (${response.status})`);
    const data = await readBoundedJson(response);
    const sources: WebSource[] = [];
    const terms = query.replace(/\bsite:\S+/gi, '').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 2);
    const siteFilter = query.match(/\bsite:([^\s]+)/i)?.[1];
    const requiredSite = siteFilter ? new URL(`https://${siteFilter}`) : null;
    for (const raw of Array.isArray(data.results) ? data.results : []) {
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const url = publicSourceUrl(record.url);
      const title = plainText(record.title, 160);
      const snippet = plainText(record.content, 600);
      if (!url || !title || !snippet || sources.some((source) => source.url === url)) continue;
      if (requiredSite) {
        const resultUrl = new URL(url);
        if (!(resultUrl.hostname === requiredSite.hostname || resultUrl.hostname.endsWith(`.${requiredSite.hostname}`)) ||
          !(requiredSite.pathname === '/' || resultUrl.pathname === requiredSite.pathname ||
            resultUrl.pathname.startsWith(`${requiredSite.pathname.replace(/\/$/, '')}/`))) continue;
      }
      // Engines can return popular but unrelated pages when they have no match.
      const searchable = `${title} ${snippet}`.toLocaleLowerCase();
      if (terms.length && !terms.some((term) => searchable.includes(term))) continue;
      sources.push({ id: `웹${sources.length + 1}`, url, title, snippet });
      if (sources.length >= 5) break;
    }
    // Cache successful nonempty searches only, bounded across projects/queries.
    if (sources.length) {
      if (cache.size >= 64) cache.delete(cache.keys().next().value as string);
      cache.set(key, { expires: Date.now() + CACHE_TTL, sources });
    }
    return sources;
  } finally { activeSearches -= 1; }
}
