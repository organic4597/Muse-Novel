import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterCloseoutPanel } from './chapter-closeout-panel';

describe('ChapterCloseoutPanel', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('saves before analysis and applies only author-approved edited candidates', async () => {
    const plan = {
      summary: '공청석유 복용으로 상태가 바뀌었습니다.', snapshotHash: 'a'.repeat(64), truncated: false, storyDate: null,
      states: [{ id: '11111111-1111-4111-8111-111111111111', category: '소지품', subjectType: 'character', subjectName: '검은 토끼', characterId: '22222222-2222-4222-8222-222222222222', worldEntryId: null,
        knowledgeScope: 'canon', knowerName: null, knowerCharacterId: null, certainty: 'known', label: '공청석유', previousValue: '보유', value: '복용 완료', details: null, evidence: '공청석유를 삼켰다.', warning: null }],
      plotNodes: [{ id: '33333333-3333-4333-8333-333333333333', nodeKind: 'consequence', title: '공청석유 복용', description: '영약을 복용했다.', lane: '공청석유', evidence: '공청석유를 삼켰다.' }],
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(plan)).mockResolvedValueOnce(Response.json({ applied: {}, chapter: { id: 'chapter' } }));
    vi.stubGlobal('fetch', fetchMock);
    const beforeAnalyze = vi.fn(async () => true); const onApplied = vi.fn();
    render(<ChapterCloseoutPanel beforeAnalyze={beforeAnalyze} chapterId="chapter" onApplied={onApplied} onClose={vi.fn()} projectId="project" />);
    fireEvent.click(screen.getByRole('button', { name: '원고 분석' }));
    await screen.findByDisplayValue('복용 완료');
    expect(beforeAnalyze).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('변경 상태'), { target: { value: '완전히 복용함' } });
    fireEvent.click(screen.getByRole('button', { name: '선택 항목 승인·반영' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(body.states[0].value).toBe('완전히 복용함');
    expect(body.plotNodes).toHaveLength(1);
    expect(onApplied).toHaveBeenCalledWith({ id: 'chapter' });
  });
});
