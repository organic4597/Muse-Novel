import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WritingIntelligencePanel } from './writing-intelligence-panel';

describe('WritingIntelligencePanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows streamed output and applies the final revision at the cursor', async () => {
    const onApply = vi.fn();
    const events = [
      'event: progress\ndata: {"stage":"plan","message":"계획 중"}\n\n',
      'event: delta\ndata: {"text":"첫 문장"}\n\n',
      'event: done\ndata: {"text":"첫 문장. 최종 문장.","plan":"대치한다.","critique":"반복을 줄인다.","memoryMode":"hybrid"}\n\n',
    ].join('');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(events, {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200,
        })
      )
    );

    render(
      <WritingIntelligencePanel
        chapterId="11111111-1111-4111-8111-111111111111"
        getCurrentContentJson={() => '[]'}
        onApply={onApply}
        onReplace={vi.fn()}
        projectId="project-1"
      />
    );
    fireEvent.change(screen.getByLabelText('작성 요청'), {
      target: { value: '대치 장면을 이어 써줘' },
    });
    fireEvent.click(screen.getByRole('button', { name: '에이전트 실행' }));

    expect(await screen.findByText('첫 문장. 최종 문장.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/완성된 원고를 검토/)).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: '현재 커서에 삽입' }));
    expect(onApply).toHaveBeenCalledWith('첫 문장. 최종 문장.');
  });

  it('keeps partial output visible but never enables insertion without done', async () => {
    const onApply = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('event: delta\ndata: {"text":"미완성 문장"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200,
        })
      )
    );
    render(
      <WritingIntelligencePanel
        chapterId="11111111-1111-4111-8111-111111111111"
        getCurrentContentJson={() => '[]'}
        onApply={onApply}
        onReplace={vi.fn()}
        projectId="project-1"
      />
    );
    fireEvent.change(screen.getByLabelText('작성 요청'), {
      target: { value: '다음 장면을 써줘' },
    });
    fireEvent.click(screen.getByRole('button', { name: '에이전트 실행' }));

    expect(await screen.findByText('미완성 문장')).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: '현재 커서에 삽입' });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/부분 출력은 원고에 적용할 수 없습니다/)).toBeInTheDocument();
  });

  it('uses the latest length, editor snapshot and cursor context on click', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('event: done\ndata: {"text":"이어진 문장"}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <WritingIntelligencePanel
        chapterId="11111111-1111-4111-8111-111111111111"
        getCurrentContentJson={async () => '[{"children":[{"text":"최신 원고"}],"type":"p"}]'}
        getCursorContext={() => ({
          after: '그 뒤에 있던 문장',
          before: '커서 바로 앞 문장',
        })}
        onApply={vi.fn()}
        onReplace={vi.fn()}
        projectId="project-1"
      />
    );
    fireEvent.change(screen.getByLabelText('작성 요청'), {
      target: { value: '이 위치에서 장면을 이어 써줘' },
    });
    fireEvent.change(screen.getByLabelText('목표 글자 수'), {
      target: { value: '777' },
    });
    fireEvent.click(screen.getByRole('button', { name: '에이전트 실행' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({
        currentContentJson: '[{"children":[{"text":"최신 원고"}],"type":"p"}]',
        cursorAfter: '그 뒤에 있던 문장',
        cursorBefore: '커서 바로 앞 문장',
        targetLength: 777,
      })
    );
  });

  it('applies a verified critic suggestion only after approval', async () => {
    const onReplace = vi.fn(() => true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          reviewedChars: 120,
          sceneNotes: [
            {
              category: 'pacing',
              issue: '행동이 같은 속도로 반복됩니다.',
              recommendation: '짧은 반응을 끼워 장면 속도를 변화시킵니다.',
            },
          ],
          suggestions: [
            {
              category: 'rhythm',
              confidence: 0.91,
              original: '그는 빠르게 빠른 걸음으로 걸었다.',
              reason: '같은 의미가 반복되어 문장 리듬이 늘어집니다.',
              replacement: '그는 빠른 걸음으로 나아갔다.',
              scope: 'sentence',
              contextBefore: '문밖에서 발소리가 들렸다. ',
              contextAfter: ' 문은 열려 있었다.',
            },
          ],
          summary: '중복 표현 한 곳을 다듬을 수 있습니다.',
          truncated: false,
        })
      )
    );

    render(
      <WritingIntelligencePanel
        chapterId="11111111-1111-4111-8111-111111111111"
        getCurrentContentJson={() =>
          '[{"children":[{"text":"그는 빠르게 빠른 걸음으로 걸었다."}],"type":"p"}]'
        }
        onApply={vi.fn()}
        onReplace={onReplace}
        projectId="project-1"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '원고 비평' }));

    expect(await screen.findAllByText('그는 빠른 걸음으로 나아갔다.')).toHaveLength(2);
    expect(screen.getByText('행동이 같은 속도로 반복됩니다.')).toBeInTheDocument();
    const request = (vi.mocked(fetch).mock.calls[0]?.[1] ?? {}) as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({ intensity: 'bold' })
    );
    expect(onReplace).not.toHaveBeenCalled();
    expect(screen.queryByText(/확신 91/)).not.toBeInTheDocument();
    expect(screen.getByText('앞뒤 문맥에 연결해서 보기')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '승인하고 교체' }));
    expect(onReplace).toHaveBeenCalledWith(
      '그는 빠르게 빠른 걸음으로 걸었다.',
      '그는 빠른 걸음으로 나아갔다.'
    );
  });

  it('never offers approval when contextual comparison is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      summary: '원고를 검토했습니다.', sceneNotes: [], suggestions: [], reviewedChars: 100,
      truncated: false, qualityReview: { status: 'unavailable', evaluated: 3, withheld: 3 },
    })));
    render(<WritingIntelligencePanel chapterId="11111111-1111-4111-8111-111111111111"
      projectId="project-1" getCurrentContentJson={() => '[]'} onApply={vi.fn()} onReplace={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '원고 비평' }));
    expect(await screen.findByText(/문맥 비교를 완료하지 못했습니다/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '승인하고 교체' })).not.toBeInTheDocument();
  });
});
