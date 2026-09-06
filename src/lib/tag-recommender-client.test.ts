import { afterEach, describe, expect, it, vi } from 'vitest';

import { recommendTags } from './tag-recommender-client';

describe('tag recommender API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the registered recommend endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tags: [
          {
            tag: 'red hair',
            category: 'hair',
            categoryLabel: '머리',
            color: '#fff',
            reason: 'match',
            score: 0.9,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await recommendTags(
      { 외모: '빨간 머리' },
      undefined,
      'http://127.0.0.1:9877'
    );

    expect(result[0]?.tag).toBe('red hair');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9877/recommend',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
