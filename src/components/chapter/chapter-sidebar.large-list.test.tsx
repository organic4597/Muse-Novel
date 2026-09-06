import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChapterSidebar } from './chapter-sidebar';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'project-1' }),
}));

vi.mock('@/components/ui/sortable', () => ({
  Sortable: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SortableContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SortableItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  SortableItemHandle: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  SortableOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function makeChapters(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    contentJson: null,
    createdAt: '2026-09-05T00:00:00.000Z',
    id: `chapter-${index}`,
    memo: null,
    order: index,
    outline: null,
    projectId: 'project-1',
    summary: null,
    title: `챕터 ${index}`,
    updatedAt: '2026-09-05T00:00:00.000Z',
    wordCount: null,
  }));
}

describe('ChapterSidebar large manuscripts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a bounded sortable window and reveals more on demand', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => makeChapters(240),
        ok: true,
      })
    );

    const { container } = render(
      <ChapterSidebar onSelectChapter={vi.fn()} selectedChapterId={null} />
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll('button[data-chapter-select]')
      ).toHaveLength(80);
    });

    fireEvent.click(screen.getByRole('button', { name: /80개 더 보기/ }));
    expect(
      container.querySelectorAll('button[data-chapter-select]')
    ).toHaveLength(160);
  });
});
