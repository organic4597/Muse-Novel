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

  it('returns the saved character without refreshing the whole route', async () => {
    const savedCharacter = {
      id: 'character-1',
      projectId: 'project-1',
      name: '연화',
      role: null,
      appearance: null,
      personality: null,
      backstory: null,
      arcDescription: null,
      itemsJson: null,
      imagePath: null,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => savedCharacter,
    });
    const onSuccess = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<CharacterForm onSuccess={onSuccess} projectId="project-1" />);

    fireEvent.change(screen.getByLabelText(/이름/i), {
      target: { value: '연화' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(savedCharacter));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('keeps an extracted voice profile unsaved until the author approves and saves it', async () => {
    const character = {
      id: 'character-1', projectId: 'project-1', name: '곽진봉', role: '주인공',
      appearance: null, personality: null, backstory: null, arcDescription: null,
      voiceGuide: null, voiceExamplesJson: null, itemsJson: null, imagePath: null,
      createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z',
    };
    const event = `event: done\ndata: ${JSON.stringify({
      guide: '짧은 평서문으로 의심을 드러낸다.',
      examples: [{ quote: '그 말은 믿기 어렵군.', note: '직접 반박하지 않는다.' }],
      reviewedChars: 1200,
      sourceChapters: 2,
    })}\n\n`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(event, { headers: { 'Content-Type': 'text/event-stream' } }))
      .mockResolvedValueOnce(Response.json({ ...character, voiceGuide: '짧은 평서문으로 의심을 드러낸다.' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CharacterForm character={character} projectId="project-1" />);
    fireEvent.click(screen.getByRole('button', { name: '원고에서 말투 추출' }));
    expect(await screen.findByText('그 말은 믿기 어렵군.', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('말투 규칙')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '후보를 편집란에 적용' }));
    expect(screen.getByLabelText('말투 규칙')).toHaveValue('짧은 평서문으로 의심을 드러낸다.');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({
      voiceGuide: '짧은 평서문으로 의심을 드러낸다.',
      voiceExamplesJson: JSON.stringify([{ quote: '그 말은 믿기 어렵군.', note: '직접 반박하지 않는다.' }]),
    });
  });
});
