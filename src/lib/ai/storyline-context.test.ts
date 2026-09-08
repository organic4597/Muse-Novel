import { describe, expect, it } from 'vitest';
import { buildStorylineSystemPrompt, selectStorylineHistory, selectStorylineManuscript } from './storyline-context';

describe('storyline context', () => {
  const chapters = [
    { id: '1', order: 1, title: '제 1장', text: '봉인된 검을 넘겨주었다.'.repeat(140) },
    { id: '2', order: 2, title: '제 2장', text: '객잔에서 지도를 펼쳤다.'.repeat(140) },
  ];
  it('finds relevant actual prose and explicitly reports partial coverage within the budget', () => {
    const result = selectStorylineManuscript(chapters, '봉인된 검의 복선', 1000);
    expect(result.references[0]).toBe('제 1장');
    expect(result.text).toContain('봉인된 검');
    expect(result.text.length).toBeLessThanOrEqual(1000);
    expect(result.partial).toBe(true);
    expect(result.readChars).toBeLessThan(result.totalChars);
  });
  it('prioritizes the explicitly selected chapter and preserves order when the whole draft fits', () => {
    expect(selectStorylineManuscript(chapters, '검', 1000, '2').references[0]).toBe('제 2장');
    const result = selectStorylineManuscript(chapters, '', 10000);
    expect(result.partial).toBe(false);
    expect(result.references).toEqual(['제 1장', '제 2장']);
    expect(result.readChars).toBe(result.totalChars);
  });
  it('keeps recent complete conversation roles rather than orphan assistant messages', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' as const : 'user' as const, text: '대화'.repeat(40) }));
    const result = selectStorylineHistory(messages, 250);
    expect(result[0].role).toBe('user');
    expect(result.at(-1)?.role).toBe('assistant');
    expect(result.length).toBeLessThan(messages.length);
  });
  it('separates tentative notes and AI suggestions from facts and asks for conclusions, not hidden reasoning', () => {
    const prompt = buildStorylineSystemPrompt({ note: '구상', canon: '세계관', manuscript: '원문', outlines: '개요', knowledge: '작법', coverage: '일부 참조' });
    expect(prompt).toContain('기존 AI 제안은 승인된 설정이 아니다');
    expect(prompt).toContain('결론과 간결한 근거');
    expect(prompt).toContain('읽었다거나');
    expect(prompt).toContain('author_storyline_draft_not_canon');
    expect(prompt).toContain('actual_manuscript_excerpts');
  });
});
