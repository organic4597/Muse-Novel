import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDailySlogan: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('@/lib/ai/daily-slogan', () => ({
  DEFAULT_DAILY_SLOGAN: '기본 창작 문장',
  getDailySlogan: mocks.getDailySlogan,
  getDailySloganDateKey: () => '2026-09-05',
}));

import { GET } from './route';

describe('GET /api/daily-slogan', () => {
  beforeEach(() => {
    mocks.getDailySlogan.mockReset();
  });

  it('returns the generated sentence with a private daily cache', async () => {
    mocks.getDailySlogan.mockResolvedValue('AI가 생성한 창작 문장');

    const response = await GET();

    expect(await response.json()).toEqual({
      date: '2026-09-05',
      slogan: 'AI가 생성한 창작 문장',
    });
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=86400');
  });

  it('uses a stable fallback when generation is unavailable', async () => {
    mocks.getDailySlogan.mockResolvedValue(null);

    const response = await GET();

    expect(await response.json()).toEqual({
      date: '2026-09-05',
      slogan: '기본 창작 문장',
    });
  });
});
