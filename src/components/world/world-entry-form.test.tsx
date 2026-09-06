import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorldEntryForm } from './world-entry-form';

describe('WorldEntryForm suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies generated suggestions including tags to the create form', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: '무명의 성소',
        category: '신앙',
        content: '버려진 신을 숭배하는 자들이 모이는 지하 성소.',
        tags: ['비밀', '의식'],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WorldEntryForm projectId="project-1" />);

    fireEvent.change(
      screen.getByPlaceholderText(/몰락한 귀족 가문의 마지막 후계자/i),
      { target: { value: '지하에서 은밀히 유지된 금지 종교의 성소' } }
    );
    fireEvent.click(screen.getByRole('button', { name: '제안 받기' }));

    await screen.findByText('무명의 성소');
    fireEvent.click(screen.getByRole('button', { name: '전체 적용' }));

    await waitFor(() => {
      const tagSection = screen.getByLabelText(/태그/i).closest('div');

      expect(screen.getByLabelText(/제목/i)).toHaveValue('무명의 성소');
      expect(screen.getByLabelText(/카테고리/i)).toHaveValue('신앙');
      expect(screen.getByLabelText(/내용/i)).toHaveValue('버려진 신을 숭배하는 자들이 모이는 지하 성소.');
      expect(tagSection).not.toBeNull();
      expect(within(tagSection as HTMLElement).getByText('비밀')).toBeInTheDocument();
      expect(within(tagSection as HTMLElement).getByText('의식')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/world-entries/suggest', expect.any(Object));
  });

  it('returns the saved entry and created tags without refreshing the route', async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'entry-1',
          projectId: 'project-1',
          title: '청운산',
          category: '장소',
          content: '운해가 드리운 산.',
          createdAt: '2026-09-05T00:00:00.000Z',
          updatedAt: '2026-09-05T00:00:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'tag-1', entryId: 'entry-1', tag: '명산' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <WorldEntryForm onSuccess={onSuccess} projectId="project-1" />
    );

    fireEvent.change(screen.getByLabelText(/제목/i), {
      target: { value: '청운산' },
    });
    fireEvent.click(screen.getByRole('button', { name: '장소' }));
    fireEvent.change(screen.getByLabelText(/^내용$/i), {
      target: { value: '운해가 드리운 산.' },
    });
    fireEvent.change(screen.getByLabelText(/태그/i), {
      target: { value: '명산' },
    });
    fireEvent.keyDown(screen.getByLabelText(/태그/i), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'entry-1',
          tags: [expect.objectContaining({ id: 'tag-1', tag: '명산' })],
        })
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
