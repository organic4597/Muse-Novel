import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CharacterAffiliations } from './character-affiliations';

const empty = { revision: 0, current: null, upcoming: null, events: [],
  organizationOptions: [{ id: '11111111-1111-4111-8111-111111111111', title: '소림사', category: '종파' }],
  chapters: [{ id: '22222222-2222-4222-8222-222222222222', title: '입문', order: 0 }],
};
describe('CharacterAffiliations', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows affiliation and position as two fields and records a reviewed timeline event', async () => {
    const saved = { ...empty, revision: 1, current: { id: 'event', chapterId: null, chapterTitle: null, boundary: 'initial', reason: null,
      memberships: [{ organizationEntryId: empty.organizationOptions[0].id, organizationTitle: '소림사', position: '명예장로', isPrimary: 1 }],
    }, events: [] };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => init?.method === 'POST' ? Response.json(saved, { status: 201 }) : Response.json(empty));
    vi.stubGlobal('fetch', fetchMock); render(<CharacterAffiliations characterId="character" projectId="project" />);
    expect(await screen.findByText('미설정')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '변화 기록' }));
    fireEvent.change(screen.getByLabelText('소속'), { target: { value: empty.organizationOptions[0].id } });
    fireEvent.change(screen.getByLabelText('직위'), { target: { value: '명예장로' } });
    fireEvent.click(screen.getByRole('button', { name: '소속 변화 저장' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/projects/project/characters/character/affiliations', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('소림사')).toBeInTheDocument(); expect(screen.getByText('명예장로')).toBeInTheDocument();
  });
});
