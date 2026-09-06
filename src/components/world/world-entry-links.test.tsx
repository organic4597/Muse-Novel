import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldEntryLinks } from './world-entry-links';

afterEach(() => vi.unstubAllGlobals());
describe('world entry link picker', () => {
  it('uses an opaque paired theme surface and retains selection/link creation', async () => {
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Response.json({ success: true });
      return _url.endsWith('/links') ? Response.json({ outgoing: [], incoming: [] }) : Response.json([
        { id: 'self', title: '소림사', category: '종파' }, { id: 'target', title: '명예장로', category: '제도' },
      ]);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldEntryLinks entryId="self" projectId="project" />);
    fireEvent.click(screen.getByRole('button', { name: '링크 추가' }));
    await screen.findByRole('option', { name: '[제도] 명예장로' });
    const picker = screen.getByRole('combobox', { name: '링크할 항목' });
    expect(picker).toHaveClass('bg-popover', 'text-popover-foreground');
    expect(picker).not.toHaveClass('bg-transparent', 'dark:bg-input/30');
    expect(screen.queryByRole('option', { name: '[종파] 소림사' })).not.toBeInTheDocument();
    fireEvent.change(picker, { target: { value: 'target' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/world-entries/self/links', expect.objectContaining({ method: 'POST', body: JSON.stringify({ targetId: 'target' }) })));
  });
});
