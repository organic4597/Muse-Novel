import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  nextProgressiveCount,
  ProgressiveListControls,
} from './progressive-list-controls';

describe('ProgressiveListControls', () => {
  it('increments a bounded window without exceeding the full list', () => {
    expect(nextProgressiveCount(48, 500, 48)).toBe(96);
    expect(nextProgressiveCount(480, 500, 48)).toBe(500);
    expect(nextProgressiveCount(0, 0, 48)).toBe(0);
  });

  it('reports the visible range and loads the next page', () => {
    const onLoadMore = vi.fn();
    render(
      <ProgressiveListControls
        onLoadMore={onLoadMore}
        shown={48}
        total={500}
      />
    );

    expect(screen.getByText(/500개 중 48개/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /48개 더 보기/ }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('does not render a load button after every item is visible', () => {
    render(
      <ProgressiveListControls onLoadMore={vi.fn()} shown={3} total={3} />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
