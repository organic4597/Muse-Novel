import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorldBuilderAssistant } from './world-builder-assistant';

const candidate = {
  id: '11111111-1111-4111-8111-111111111111', projectId: 'project-1', batchId: 'batch-1',
  title: '공청석유', category: '영약', content: '영약의 후보 설명', tags: ['영약', '무협'],
  status: 'pending', approvedEntryId: null, createdAt: null,
};

describe('WorldBuilderAssistant review flow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not add generated entries until explicit approval, then returns saved tags', async () => {
    const onEntriesAdded = vi.fn();
    const savedEntry = { ...candidate, id: 'canon-1', tags: [{ id: 'tag-1', tag: '영약' }], updatedAt: null };
    const fetchMock = vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
      if (!init?.method) return Response.json({ suggestions: [] });
      const body = JSON.parse(String(init.body));
      if (body.action) return Response.json({ suggestions: [{ ...candidate, status: 'approved', approvedEntryId: 'canon-1' }], entries: [savedEntry] });
      return Response.json({ suggestions: [candidate], requestedCount: 1 });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldBuilderAssistant onEntriesAdded={onEntriesAdded} projectId="project-1" />);
    fireEvent.change(screen.getByLabelText('웹 검색'), { target: { value: 'always' } });
    fireEvent.change(screen.getByLabelText('세계관 어시스턴트 요청'), { target: { value: '영약 하나를 찾아 추가해줘' } });
    fireEvent.click(screen.getByRole('button', { name: '후보 생성' }));
    const card = await screen.findByRole('article', { name: '공청석유 검토 후보' });
    expect(onEntriesAdded).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/world-entries/assistant', expect.objectContaining({
      body: JSON.stringify({ instruction: '영약 하나를 찾아 추가해줘', webSearchMode: 'always' }),
    }));
    fireEvent.click(within(card).getByRole('button', { name: '승인' }));
    await waitFor(() => expect(onEntriesAdded).toHaveBeenCalledWith([savedEntry]));
    expect(screen.getByText('승인됨 · 세계관 반영')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/world-entries/assistant/review', expect.objectContaining({
      body: JSON.stringify({ suggestionIds: [candidate.id], action: 'approve' }),
    }));
  });

  it('restores pending drafts after refresh and rejection never adds entries', async () => {
    const onEntriesAdded = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
      if (!init?.method) return Response.json({ suggestions: [candidate] });
      return Response.json({ suggestions: [{ ...candidate, status: 'rejected' }], entries: [] });
    }));
    render(<WorldBuilderAssistant onEntriesAdded={onEntriesAdded} projectId="project-1" />);
    const card = await screen.findByRole('article', { name: '공청석유 검토 후보' });
    fireEvent.click(within(card).getByRole('button', { name: '거부' }));
    expect(await screen.findByText('거부됨 · 미반영')).toBeInTheDocument();
    expect(onEntriesAdded).not.toHaveBeenCalled();
  });

  it('keeps a pending draft available for retry when saving approval fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
      if (!init?.method) return Response.json({ suggestions: [candidate] });
      return Response.json({ error: '저장 실패' }, { status: 500 });
    }));
    render(<WorldBuilderAssistant projectId="project-1" />);
    const card = await screen.findByRole('article', { name: '공청석유 검토 후보' });
    fireEvent.click(within(card).getByRole('button', { name: '승인' }));
    expect(await screen.findByText('저장 실패')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: '승인' })).toBeEnabled();
    expect(screen.queryByText('승인됨 · 세계관 반영')).not.toBeInTheDocument();
  });
});
