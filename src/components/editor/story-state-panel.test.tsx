import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoryStatePanel } from './story-state-panel';

describe('StoryStatePanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('현재 챕터에 상태 변화를 추가하고 목록에 즉시 표시한다', async () => {
    const fetchMock = vi.fn().mockImplementation(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/characters')) {
          return Response.json([
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: '검은 토끼',
            },
          ]);
        }
        if (!init?.method) return Response.json([]);
        if (init.method === 'POST') {
          return Response.json(
            {
              category: '소지품',
              chapterId: '11111111-1111-4111-8111-111111111111',
              chapterTitle: '3장 소림 입문',
              characterId: '22222222-2222-4222-8222-222222222222',
              characterName: '검은 토끼',
              createdAt: new Date().toISOString(),
              details: null,
              id: '33333333-3333-4333-8333-333333333333',
              isActive: 1,
              isPinned: 0,
              label: '공청석유',
              previousValue: '바위 틈에 숨김',
              projectId: 'project-1',
              updatedAt: new Date().toISOString(),
              value: '품에 소지',
            },
            { status: 201 }
          );
        }
        return Response.json({ error: 'unexpected request' }, { status: 500 });
      }
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <StoryStatePanel
        chapterId="11111111-1111-4111-8111-111111111111"
        chapterTitle="3장 소림 입문"
        projectId="project-1"
      />
    );

    expect(
      await screen.findByText('아직 현재 상태가 없습니다.')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('분류'), {
      target: { value: '소지품' },
    });
    fireEvent.change(screen.getByLabelText('대상'), {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    });
    fireEvent.change(screen.getByLabelText('항목 이름'), {
      target: { value: '공청석유' },
    });
    fireEvent.change(screen.getByLabelText('이전 값 (선택)'), {
      target: { value: '바위 틈에 숨김' },
    });
    fireEvent.change(screen.getByLabelText('현재 값'), {
      target: { value: '품에 소지' },
    });
    fireEvent.click(screen.getByRole('button', { name: '메모 추가' }));

    expect(await screen.findByText('검은 토끼 · 공청석유')).toBeInTheDocument();
    expect(screen.getByText('품에 소지')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/story-state',
        expect.objectContaining({
          body: expect.stringContaining(
            '11111111-1111-4111-8111-111111111111'
          ),
          method: 'POST',
        })
      )
    );
  });
});
