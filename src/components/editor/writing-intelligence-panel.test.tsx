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
});
