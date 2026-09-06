import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterReferenceBar } from './chapter-reference-bar';

const initial = { revision: 0, references: [], options: {
  characters: [{ id: '11111111-1111-4111-8111-111111111111', name: '검은 토끼', group: 'character' }], worldEntries: [],
} };
describe('ChapterReferenceBar', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('adds a compact chapter reference, distinguishes mention and saves independently', async () => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => init?.method === 'PUT'
      ? Response.json({ ...initial, revision: 1, references: [{ id: 'ref', projectId: 'project', chapterId: 'chapter', characterId: initial.options.characters[0].id, worldEntryId: null,
        title: '검은 토끼', category: null, group: 'character', presence: 'mentioned', displayGroupOverride: null, note: null, sortOrder: 0, affiliations: [], createdAt: null, updatedAt: null }] })
      : Response.json(initial));
    vi.stubGlobal('fetch', fetchMock); render(<ChapterReferenceBar chapterId="chapter" projectId="project" />);
    fireEvent.click(await screen.findByRole('button', { name: '인물 0' }));
    fireEvent.change(screen.getByLabelText('인물 추가'), { target: { value: initial.options.characters[0].id } });
    fireEvent.change(screen.getByLabelText('검은 토끼 등장 방식'), { target: { value: 'mentioned' } });
    fireEvent.click(screen.getByRole('button', { name: '연결 저장' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/chapters/chapter/references', expect.objectContaining({
      method: 'PUT', body: expect.stringContaining('"presence":"mentioned"'),
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('등장 항목을 저장했습니다');
  });
});
