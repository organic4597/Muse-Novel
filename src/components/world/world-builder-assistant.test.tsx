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

  it('shows an existing-entry diff and applies it only after explicit approval', async () => {
    const onEntriesAdded = vi.fn();
    const edit = {
      entryId: 'existing', title: '모용세가', baseVersion: 'a'.repeat(64), note: '가문의 근거지를 보강했습니다.',
      before: { title: '모용세가', category: '세가', content: '기존 설명', researchJson: null },
      changes: { content: '모용세가는 요동의 교역로를 장악한 가문이다.' },
      research: { status: 'skipped', queries: [], sources: [] },
    };
    const updated = { id: 'existing', projectId: 'project-1', title: '모용세가', category: '세가', content: edit.changes.content, createdAt: null, updatedAt: null };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) return Response.json({ suggestions: [] });
      if (url.includes('/entity-edits/world/existing')) return Response.json({ entry: updated });
      return Response.json({
        operation: 'update', suggestions: [], editSuggestions: [edit], requestedCount: 1,
        report: { instruction: '모용세가 수정', requestedCount: 1, expectedTitles: ['모용세가'], existingTitles: ['모용세가'], updateTitles: ['모용세가'], pendingTitles: [], generatedCount: 0, missingTitles: [], warnings: [], diagnostics: [] },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<WorldBuilderAssistant onEntriesAdded={onEntriesAdded} projectId="project-1" />);
    fireEvent.change(screen.getByLabelText('세계관 어시스턴트 요청'), { target: { value: '모용세가 설명을 수정해줘' } });
    fireEvent.click(screen.getByRole('button', { name: '후보 생성' }));
    const card = await screen.findByRole('article', { name: '모용세가 기존 항목 수정 후보' });
    expect(within(card).getByText('기존 설명')).toBeInTheDocument();
    expect(within(card).getByText('모용세가는 요동의 교역로를 장악한 가문이다.')).toBeInTheDocument();
    expect(onEntriesAdded).not.toHaveBeenCalled();
    fireEvent.click(within(card).getByRole('button', { name: '수정 승인' }));
    await waitFor(() => expect(onEntriesAdded).toHaveBeenCalledWith([updated]));
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/entity-edits/world/existing', expect.objectContaining({
      body: JSON.stringify({ action: 'apply', baseVersion: edit.baseVersion, changes: edit.changes }),
    }));
    expect(screen.getByText('승인됨 · 수정 반영')).toBeInTheDocument();
  });
});
