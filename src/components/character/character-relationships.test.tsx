import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CharacterRelationships } from './character-relationships';

const existingRelationship = {
  id: 'relationship-1',
  characterAId: 'character-1',
  characterBId: 'character-2',
  relationshipType: '라이벌',
  description: '서로 앞서려 한다.',
  createdAt: '2026-09-05T00:00:00.000Z',
  otherCharacterName: '은서',
  otherCharacterId: 'character-2',
};

const characters = [
  { id: 'character-1', name: '하진' },
  { id: 'character-2', name: '은서' },
];

function createFetchMock(initialRelationships = [existingRelationship]) {
  return vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/relationships') && method === 'GET') {
        return { ok: true, json: async () => initialRelationships };
      }

      if (url.endsWith('/characters') && method === 'GET') {
        return { ok: true, json: async () => characters };
      }

      if (url.endsWith('/relationships') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            id: 'relationship-2',
            characterAId: 'character-1',
            characterBId: 'character-2',
            relationshipType: '동료',
            description: '함께 여행한다.',
            createdAt: '2026-09-05T01:00:00.000Z',
          }),
        };
      }

      if (url.endsWith('/relationships/relationship-1') && method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            ...existingRelationship,
            relationshipType: '동료',
            description: '이제는 서로 신뢰한다.',
          }),
        };
      }

      if (
        url.endsWith('/relationships/relationship-1') &&
        method === 'DELETE'
      ) {
        return { ok: true, json: async () => ({ success: true }) };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }
  );
}

describe('CharacterRelationships local mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds the API response to the list without refetching relationships', async () => {
    const fetchMock = createFetchMock([]);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CharacterRelationships
        characterId="character-1"
        projectId="project-1"
      />
    );

    await screen.findByText('등록된 관계가 없습니다.');
    fireEvent.click(screen.getByRole('button', { name: '관계 추가' }));
    fireEvent.change(screen.getByLabelText('대상 캐릭터'), {
      target: { value: 'character-2' },
    });
    fireEvent.change(screen.getByLabelText('관계 유형'), {
      target: { value: '동료' },
    });
    fireEvent.change(screen.getByLabelText('설명'), {
      target: { value: '함께 여행한다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: '추가' })
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('함께 여행한다.')).toBeInTheDocument();
    expect(screen.getByText('은서')).toBeInTheDocument();
    expect(screen.getByText('동료')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith('/relationships') &&
          (init?.method ?? 'GET') === 'GET'
      )
    ).toHaveLength(1);
  });

  it('merges the update response into the existing list without refetching', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CharacterRelationships
        characterId="character-1"
        projectId="project-1"
      />
    );

    await screen.findByText('은서');
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('관계 유형'), {
      target: { value: '동료' },
    });
    fireEvent.change(screen.getByLabelText('설명'), {
      target: { value: '이제는 서로 신뢰한다.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(await screen.findByText('동료')).toBeInTheDocument();
    expect(screen.getByText('이제는 서로 신뢰한다.')).toBeInTheDocument();
    expect(screen.queryByText('라이벌')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith('/relationships') &&
          (init?.method ?? 'GET') === 'GET'
      )
    ).toHaveLength(1);
  });

  it('removes a deleted relationship without refetching', async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(
      <CharacterRelationships
        characterId="character-1"
        projectId="project-1"
      />
    );

    await screen.findByText('은서');
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(screen.queryByText('은서')).not.toBeInTheDocument();
    });
    expect(screen.getByText('등록된 관계가 없습니다.')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith('/relationships') &&
          (init?.method ?? 'GET') === 'GET'
      )
    ).toHaveLength(1);
  });
});
