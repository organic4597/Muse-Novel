import { describe, expect, it } from 'vitest';
import { formatStorylineNoteSummary, selectStorylineNoteEditContext, validateStorylineNoteEditPlan } from './storyline-assistant';

describe('storyline note summary', () => {
  it('formats only non-empty decision sections as a reusable note', () => {
    expect(formatStorylineNoteSummary({
      title: '북악 향산 2막 방향',
      confirmed: ['주인공은 소림의 명예장로가 된다.'],
      proposals: ['어린 승려가 소림 편입을 중재하게 한다.'],
      openQuestions: [],
    })).toBe([
      '## 북악 향산 2막 방향',
      '### 확정된 내용',
      '- 주인공은 소림의 명예장로가 된다.',
      '### 검토할 제안',
      '- 어린 승려가 소림 편입을 중재하게 한다.',
    ].join('\n\n'));
  });
  it('keeps unique non-overlapping exact edits and rejects unsafe targets', () => {
    const plan = validateStorylineNoteEditPlan('소속: 개방\n직위: 객원\n반복\n반복', {
      summary: '소속과 직위를 변경한다.',
      edits: [
        { original: '소속: 개방', replacement: '소속: 소림', reason: '소속 변경' },
        { original: '직위: 객원', replacement: '직위: 명예장로', reason: '직위 변경' },
        { original: '반복', replacement: '제외', reason: '모호한 대상' },
      ],
      addition: '  ', warnings: [],
    });
    expect(plan.edits).toHaveLength(2);
    expect(plan.addition).toBe('');
    expect(plan.warnings[0]).toContain('1개는 제외');
  });
  it('selects relevant excerpts when an author note is larger than the model budget', () => {
    const note = ['초반 설정 '.repeat(300), '소림 명예장로 설정 '.repeat(100), '결말 설정 '.repeat(300)].join('\n');
    const selected = selectStorylineNoteEditContext(note, '소림 명예장로를 객원장로로 수정', 2400);
    expect(selected).toContain('소림 명예장로');
    expect(selected.length).toBeLessThanOrEqual(2400);
    expect(selected).not.toBe(note);
  });
});
