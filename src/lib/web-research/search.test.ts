import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicSourceUrl, searchWeb } from './search';

afterEach(() => vi.unstubAllGlobals());

describe('bounded SearXNG search', () => {
  it('reads JSON search summaries, deduplicates URLs and caches a successful query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [
      { title: '<b>소림사</b>', url: 'https://ko.wikipedia.org/wiki/소림사', content: '소림사의 역사와 문화.' },
      { title: '중복', url: 'https://ko.wikipedia.org/wiki/소림사', content: '중복 요약' },
      { title: '위험 링크', url: 'javascript:alert(1)', content: '본문' },
      { title: 'Gmail', url: 'https://mail.google.com', content: 'Sign in to your email account.' },
    ] }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await searchWeb('http://search.internal:8080', '소림사 역사 cache-test');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: '웹1', title: '소림사' });
    expect(fetchMock).toHaveBeenCalledWith('http://search.internal:8080/search', expect.objectContaining({
      redirect: 'error', method: 'POST',
    }));
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('format=json');
    expect(await searchWeb('http://search.internal:8080', '소림사 역사 cache-test')).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'http://127.0.0.1/a', 'http://10.0.0.42/a', 'http://localhost/a', 'http://host.internal/a', 'https://user:secret@example.org'])('rejects unsafe source URL %s', (url) => {
    expect(publicSourceUrl(url)).toBeNull();
  });

  it('does not cache errors or interpret a blocked provider as successful research', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchWeb('http://search.internal:8080', 'blocked-query')).rejects.toThrow('403');
    await expect(searchWeb('http://search.internal:8080', 'blocked-query')).rejects.toThrow('403');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds response size and never fetches returned document URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('x'.repeat(512_001)));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchWeb('http://search.internal:8080', 'oversized-query')).rejects.toThrow('너무 큽니다');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces the selected channel even if the engine ignores the site operator', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ results: [
      { title: '작법 정보', url: 'https://arca.live/b/webfiction/123', content: '작법에 관한 조언.' },
      { title: '작법 정보', url: 'https://arca.live/b/other/123', content: '다른 채널의 작법.' },
      { title: '작법 정보', url: 'https://arca.live/b/webfiction-fake/123', content: '유사 이름 채널의 작법.' },
    ] })));
    const results = await searchWeb('http://search.internal:8080', 'site:arca.live/b/webfiction 작법');
    expect(results.map((source) => source.url)).toEqual(['https://arca.live/b/webfiction/123']);
  });
});
