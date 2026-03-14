import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CharacterForm } from './character-form';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe('CharacterForm suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies generated suggestions to the create form', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: '리안',
        role: '주인공',
        appearance: '은빛 머리와 창백한 피부.',
        personality: '무심한 척하지만 다정하다.',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CharacterForm projectId="project-1" />);

    fireEvent.change(
      screen.getByPlaceholderText(/몰락한 귀족 가문의 마지막 후계자/i),
      { target: { value: '비밀 조직에서 도망친 젊은 검사' } }
    );
    fireEvent.click(screen.getByRole('button', { name: '제안 받기' }));

    await screen.findByText('리안');
    fireEvent.click(screen.getByRole('button', { name: '전체 적용' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/이름/i)).toHaveValue('리안');
      expect(screen.getByLabelText(/역할/i)).toHaveValue('주인공');
      expect(screen.getByLabelText(/외모/i)).toHaveValue('은빛 머리와 창백한 피부.');
      expect(screen.getByLabelText(/성격/i)).toHaveValue('무심한 척하지만 다정하다.');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/characters/suggest', expect.any(Object));
  });
});