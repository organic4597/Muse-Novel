import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebResearchSources } from './web-research-controls';

describe('compact reference dropdown', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('keeps source links hidden until the user opens the dropdown', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    render(<WebResearchSources research={{ status: 'searched', queries: ['구파일방'], sources: [
      { id: '웹1', title: '문파 자료', url: 'https://example.org/very-long-reference-url', snippet: '요약' },
    ] }} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '검색 내역 1개' }));
    expect(await screen.findByRole('link', { name: '[웹1] 문파 자료' })).toHaveAttribute('href', 'https://example.org/very-long-reference-url');
    expect(screen.queryByText('https://example.org/very-long-reference-url')).not.toBeInTheDocument();
  });
});
