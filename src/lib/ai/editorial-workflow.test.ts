import { describe, expect, it, vi } from 'vitest';
import { manuscriptSnapshot, rewriteGoals, validateEditGoals } from './editorial-workflow';
describe('targeted editorial workflow', () => {
  const goal = { original: '그는 걸었다.', action: 'compress' as const, issue: '반복', objective: '주어 반복을 압축' };
  it('keeps exact unique targets and removes overlaps and fabricated quotes', () => {
    expect(validateEditGoals('그는 걸었다. 문은 닫혀 있었다.', [goal, goal, { ...goal, original: '없는 문장' }])).toEqual([goal]);
  });
  it('refuses a rewrite before inference when manuscript changed', async () => {
    await expect(rewriteGoals({ db: {} as never, projectId: 'a', chapterId: 'c', prose: '수정한 본문', goals: [goal], supplement: '', snapshot: manuscriptSnapshot('이전 본문'), signal: new AbortController().signal, progress: vi.fn() })).rejects.toThrow('MANUSCRIPT_CHANGED');
  });
  it('requires author-provided facts for supplementation', async () => {
    await expect(rewriteGoals({ db: {} as never, projectId: 'a', chapterId: 'c', prose: goal.original, goals: [{ ...goal, action: 'supplement' }], supplement: '', snapshot: manuscriptSnapshot(goal.original), signal: new AbortController().signal, progress: vi.fn() })).rejects.toThrow('SUPPLEMENT_REQUIRED');
  });
});
