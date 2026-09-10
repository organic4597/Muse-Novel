import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WritingIntelligencePanel } from './writing-intelligence-panel';

describe('WritingIntelligencePanel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only author-selected goals and the diagnosed snapshot for rewriting', async () => {
    const goal = { action: 'compress', original: '그는 걸었다.', issue: '반복', objective: '반복만 압축' };
    const fetchMock = vi.fn(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return Response.json(body.action === 'diagnose' ? { summary: '목표', goals: [goal, { ...goal, action: 'keep', original: '그는 멈췄다.' }], snapshot: 'a'.repeat(64), reviewedChars: 100, truncated: false }
        : { summary: '비교 완료', suggestions: [], sceneNotes: [], reviewedChars: 100, truncated: false });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onReplace = vi.fn();
    render(<WritingIntelligencePanel projectId="project" chapterId="chapter" getCurrentContentJson={() => '[]'} onApply={vi.fn()} onReplace={onReplace} />);
    fireEvent.click(screen.getByRole('button', { name: '편집 목표 찾기' }));
    await screen.findByText('편집 목표 선택');
    fireEvent.click(screen.getByLabelText('압축 · 반복'));
    fireEvent.click(screen.getByRole('button', { name: '선택한 목표로 수정문 생성 (1/4)' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({ action: 'rewrite', goals: [goal], snapshot: 'a'.repeat(64) });
    expect(onReplace).not.toHaveBeenCalled();
  });

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

  it('requires author approval of an editable scene contract before generating prose', async () => {
    const plan = {
      viewpoint: '곽진봉', location: '북악 향산', goal: '사파의 의도를 파악한다', obstacle: '신분을 숨겨야 한다',
      participants: '곽진봉 | 정보 수집 | 공청석유 소문 | 무심한 척 질문', dialoguePurpose: '상대의 거짓말을 확인한다',
      beats: '경계의 말을 듣는다\n모순을 발견한다', outcome: '의심할 단서를 얻는다', turningPoint: '침묵하기로 결정한다',
      reveal: '사파가 먼저 움직였다', conceal: '정체를 눈치챘다는 사실', preserve: '과묵한 말투', openQuestions: '',
    };
    const first = `event: done\ndata: ${JSON.stringify({ text: '', plan: '계획', planData: plan, requiresPlanApproval: true })}\n\n`;
    const second = 'event: done\ndata: {"text":"승인 뒤 생성된 본문"}\n\n';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(first, { headers: { 'Content-Type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(second, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WritingIntelligencePanel chapterId="11111111-1111-4111-8111-111111111111" getCurrentContentJson={() => '[]'} onApply={vi.fn()} onReplace={vi.fn()} projectId="project-1" />);
    fireEvent.change(screen.getByLabelText('작성 요청'), { target: { value: '대치 장면을 써줘' } });
    fireEvent.click(screen.getByRole('button', { name: '에이전트 실행' }));
    expect(await screen.findByRole('region', { name: '장면 계약 검토' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('대화가 바꾸어야 할 것'), { target: { value: '동맹 제안을 거절한다' } });
    fireEvent.click(screen.getByRole('button', { name: '이 설계로 본문 생성' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toMatchObject({ approvedPlan: { dialoguePurpose: '동맹 제안을 거절한다' } });
    expect(await screen.findByText('승인 뒤 생성된 본문')).toBeInTheDocument();
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

  it('continues an uninserted generated draft and applies the combined result once', async () => {
    const approvedPlan = { viewpoint: '', location: '', goal: '계속 전진한다', obstacle: '', participants: '', dialoguePurpose: '', beats: '다음 단서를 찾는다', outcome: '', turningPoint: '', reveal: '', conceal: '', preserve: '', openQuestions: '' };
    const first = `event: done\ndata: ${JSON.stringify({ text: '첫 생성 문단.', actualLength: 7, targetLength: 600, lengthSatisfied: false, planData: approvedPlan })}\n\n`;
    const second = 'event: done\ndata: {"text":"이어진 두 번째 문단.","actualLength":11,"targetLength":600,"lengthSatisfied":false}\n\n';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(first, { headers: { 'Content-Type': 'text/event-stream' } }))
      .mockResolvedValueOnce(new Response(second, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock); const onApply = vi.fn();
    render(<WritingIntelligencePanel chapterId="11111111-1111-4111-8111-111111111111" getCurrentContentJson={() => '[]'} onApply={onApply} onReplace={vi.fn()} projectId="project-1" />);
    fireEvent.change(screen.getByLabelText('작성 요청'), { target: { value: '장면을 이어 써줘' } });
    fireEvent.change(screen.getByLabelText('목표 글자 수'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: '에이전트 실행' }));
    await screen.findByText('첫 생성 문단.');
    fireEvent.click(screen.getByRole('button', { name: '이 결과에서 계속 작성' }));
    expect(await screen.findByText(/첫 생성 문단\.\s+이어진 두 번째 문단\./)).toBeInTheDocument();
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(secondBody).toMatchObject({ continuationText: '첫 생성 문단.', targetLength: 600, approvedPlan });
    fireEvent.click(screen.getByRole('button', { name: '현재 커서에 삽입' }));
    expect(onApply).toHaveBeenCalledWith('첫 생성 문단.\n\n이어진 두 번째 문단.');
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
