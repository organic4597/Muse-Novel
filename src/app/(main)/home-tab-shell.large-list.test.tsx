import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeTabShell } from './home-tab-shell';

vi.mock('./daily-slogan-card', () => ({
  DailySloganCard: () => <div>오늘의 창작 문장</div>,
}));

vi.mock('./create-project-form', () => ({
  CreateProjectForm: () => <button type="button">새 소설</button>,
}));

function makeProjects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    createdAt: '2026-09-05T00:00:00.000Z',
    genre: index % 2 === 0 ? '판타지' : '무협',
    id: `project-${index}`,
    synopsis: `긴 목록 성능 검증용 줄거리 ${index}`,
    title: `성능 검증 작품 ${index}`,
  }));
}

describe('HomeTabShell large libraries', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a bounded first window and progressively reveals more cards', () => {
    const { container } = render(<HomeTabShell projects={makeProjects(500)} />);

    expect(container.querySelectorAll('a[data-project-card]')).toHaveLength(48);
    const loadMore = screen.getByText('48개 더 보기').closest('button');
    expect(loadMore).not.toBeNull();
    fireEvent.click(loadMore as HTMLButtonElement);
    expect(container.querySelectorAll('a[data-project-card]')).toHaveLength(96);
  });

  it('searches the complete library including cards outside the render window', async () => {
    const { container } = render(
      <HomeTabShell projects={makeProjects(500)} />
    );

    fireEvent.change(screen.getByRole('searchbox', { name: '소설 검색' }), {
      target: { value: '성능 검증 작품 499' },
    });

    await waitFor(() => {
      expect(
        container.querySelector('a[href="/projects/project-499"]')
      ).not.toBeNull();
    });
    expect(container.querySelectorAll('a[data-project-card]')).toHaveLength(1);
  });
});
