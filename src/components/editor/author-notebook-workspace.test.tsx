import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImperativeHandle } from 'react';
import type { PlateEditorProps } from './plate-editor';

const editorCalls = vi.hoisted(() => ({ props: [] as PlateEditorProps[] }));
vi.mock('next/dynamic', () => ({ default: () => function MockNoteEditor(props: PlateEditorProps) {
  editorCalls.props.push(props);
  useImperativeHandle(props.ref, () => ({ applyTextEdits: () => false, flushProcessing: async () => {}, getSelectedText: () => '', getCursorContext: () => ({ before: '', after: '' }), insertText: () => {}, replaceText: () => false }));
  const initial = JSON.parse(props.content ?? '[]');
  return <textarea aria-label={props.ariaLabel} defaultValue={initial.map((node: { children: { text: string }[] }) => node.children.map(leaf => leaf.text).join('')).join('\n')}
    onChange={event => props.onValueChange?.(JSON.stringify([{ type: 'p', children: [{ text: event.target.value, bold: true }] }]))} />;
} }));

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
      editorJson: JSON.stringify([{ type: 'p', children: [{ text: '수정된 전체 플롯', bold: true }] }]),
    });
    expect(editorCalls.props.at(-1)).toMatchObject({ documentId: `note:${baseNote.id}`, ghostTextEnabled: false, projectId: 'project-1' });
  });

  it('serializes saves and does not publish stale content while newer edits await saving', async () => {
    const responses: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => responses.push(resolve)));
    vi.stubGlobal('fetch', fetchMock);
    const onNoteUpdated = vi.fn();
    const onClose = vi.fn();
    render(<AuthorNotebookWorkspace
      note={{ ...baseNote, contentJson: '{"text":"초기 구상"}', kind: 'text' }}
      onClose={onClose} onNoteUpdated={onNoteUpdated} projectId="project-1"
    />);
    const editor = screen.getByLabelText('작가 구상 노트');
    fireEvent.change(editor, { target: { value: '첫 번째 수정' } });
    fireEvent.blur(editor);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(editor, { target: { value: '최신 수정' } });
    fireEvent.click(screen.getByRole('button', { name: '작가 노트 닫기' }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { responses[0](Response.json({ ...baseNote, kind: 'text', contentJson: '{"text":"첫 번째 수정"}' })); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(onNoteUpdated).not.toHaveBeenCalled();
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(body.content.text).toBe('최신 수정');
    await act(async () => { responses[1](Response.json({ ...baseNote, kind: 'text', contentJson: JSON.stringify(body.content) })); });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onNoteUpdated).toHaveBeenCalledOnce();
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
