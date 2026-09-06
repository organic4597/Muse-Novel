import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CharacterList } from './character-list';

vi.mock('./character-form', () => ({
  CharacterForm: () => <div>캐릭터 폼</div>,
}));

vi.mock('./character-image-upload', () => ({
  CharacterImageUpload: () => null,
}));

function makeCharacters(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    appearance: null,
    arcDescription: null,
    backstory: `검색 가능한 과거 ${index}`,
    createdAt: null,
    id: `character-${index}`,
    imagePath: null,
    itemsJson: null,
    name: `대규모 인물 ${index}`,
    personality: index === count - 1 ? '목록 밖의 특별한 성격' : null,
    projectId: 'project-1',
    role: '조연',
    updatedAt: null,
  }));
}

describe('CharacterList large character bibles', () => {
  it('bounds rendered cards while retaining full-list search', async () => {
    render(
      <CharacterList characters={makeCharacters(500)} projectId="project-1" />
    );

    expect(screen.getAllByRole('button', { name: /대규모 인물/ })).toHaveLength(
      48
    );

    fireEvent.change(screen.getByRole('searchbox', { name: '캐릭터 검색' }), {
      target: { value: '목록 밖의 특별한 성격' },
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /대규모 인물 499/ })
      ).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: /대규모 인물/ })).toHaveLength(
      1
    );
  });
});
