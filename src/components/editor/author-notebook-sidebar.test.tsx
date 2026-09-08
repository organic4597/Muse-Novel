import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthorNotebookSidebar } from './author-notebook-sidebar';

describe('AuthorNotebookSidebar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups notes under folders and opens a selected note', async () => {
    const note = {
      contentJson: '{"text":"전체 플롯"}',
      folderId: '11111111-1111-4111-8111-111111111111',
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'text' as const,
      order: 1,
      projectId: 'project-1',
      title: '1막 구상',
      updatedAt: new Date().toISOString(),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          assets: [],
          folders: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              name: '전체 플롯',
              order: 1,
            },
          ],
          notes: [note],
        })
      )
    );
    const onSelectNote = vi.fn();

    render(
      <AuthorNotebookSidebar
        onSelectNote={onSelectNote}
        projectId="project-1"
        selectedNoteId={null}
      />
    );

    expect(await screen.findByText('전체 플롯')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1막 구상/u }));
    expect(onSelectNote).toHaveBeenCalledWith(note);
  });
});
