import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthorNotebookWorkspace } from './author-notebook-workspace';

const baseNote = {
  folderId: null,
  id: '22222222-2222-4222-8222-222222222222',
  order: 1,
  projectId: 'project-1',
  title: '전체 구상',
  updatedAt: new Date().toISOString(),
};

describe('AuthorNotebookWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('saves a text note with the latest content on blur', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return Response.json({
        ...baseNote,
        contentJson: JSON.stringify(body.content),
        kind: 'text',
        title: body.title,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthorNotebookWorkspace
        note={{ ...baseNote, contentJson: '{"text":"초기 구상"}', kind: 'text' }}
        onClose={vi.fn()}
        onNoteUpdated={vi.fn()}
        projectId="project-1"
      />
    );
    const editor = screen.getByLabelText('작가 구상 노트');
    fireEvent.change(editor, { target: { value: '수정된 전체 플롯' } });
    fireEvent.blur(editor);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).content).toEqual({
      text: '수정된 전체 플롯',
    });
  });

  it('adds and persists an editable mind-map card', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return Response.json({
        ...baseNote,
        contentJson: JSON.stringify(body.content),
        kind: 'mindmap',
        title: body.title,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthorNotebookWorkspace
        note={{
          ...baseNote,
          contentJson: '{"edges":[],"nodes":[]}',
          kind: 'mindmap',
        }}
        onClose={vi.fn()}
        onNoteUpdated={vi.fn()}
        projectId="project-1"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '아이디어 카드' }));
    const card = await screen.findByLabelText('마인드맵 카드 내용');
    fireEvent.change(card, { target: { value: '주인공의 최종 선택' } });
    fireEvent.blur(card);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    const saved = JSON.parse(String(request.body)).content;
    expect(saved.nodes[0].text).toBe('주인공의 최종 선택');
  });
});
