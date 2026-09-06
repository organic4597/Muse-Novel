import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DailySloganCard } from './daily-slogan-card';

const STORAGE_KEY = 'muse-novel-daily-slogan';

describe('DailySloganCard', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a same-day browser cache and otherwise loads the slogan after render', async () => {
    const dateParts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Seoul',
      year: 'numeric',
    }).formatToParts(new Date());
    const dateValues = Object.fromEntries(
      dateParts.map((part) => [part.type, part.value])
    );
    const today = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ date: today, slogan: '브라우저에 저장된 창작 문장' })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const cachedRender = render(<DailySloganCard />);

    expect(await screen.findByText('브라우저에 저장된 창작 문장')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    cachedRender.unmount();
    localStorage.clear();
    fetchMock.mockResolvedValue(
      Response.json({ date: today, slogan: 'API에서 늦게 도착한 창작 문장' })
    );

    render(<DailySloganCard />);

    expect(screen.getByText(/한 문장을 쓰는 순간/)).toBeInTheDocument();
    expect(await screen.findByText('API에서 늦게 도착한 창작 문장')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/daily-slogan?date=${today}`,
      { cache: 'force-cache' }
    );
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({
        date: today,
        slogan: 'API에서 늦게 도착한 창작 문장',
      });
    });
  });
});
