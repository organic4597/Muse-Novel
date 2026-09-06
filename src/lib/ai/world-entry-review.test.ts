import { describe, expect, it, vi } from 'vitest';
import { reviewWorldEntries } from './world-entry-review';

const entries = [{ title: '금서방', content: '금서방의 작가는 소설을 써서 독자에게 판다.' }];
const base = { entries, instruction: '서점 설정을 추가해줘', context: '책이 금지된 도시' };

describe('contextual description review boundary', () => {
  it('passes the request, setting and full description together, without lexical rejection', async () => {
    const generate = vi.fn(async () => ({ reviews: [{ title: '금서방', verdict: 'accept' }] }));
    const result = await reviewWorldEntries({ ...base, generate });
    expect(result.get('금서방')?.verdict).toBe('accept');
    expect(generate).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('책이 금지된 도시'), expect.objectContaining({ stage: 'review-descriptions' }));
    expect(generate).toHaveBeenCalledWith(expect.any(String), expect.stringContaining(entries[0].content), expect.any(Object));
  });
  it.each([
    { reviews: [] },
    { reviews: [{ title: '다른 곳', verdict: 'accept' }] },
    { reviews: [{ title: '금서방', verdict: 'accept' }, { title: '금서방', verdict: 'accept' }] },
    { reviews: [{ title: '금서방', verdict: 'revise', evidence: '본문에 없는 인용', reason: '잘못된 근거' }] },
    { reviews: [{ title: '금서방', verdict: 'revise', evidence: '소설' }] },
    { reviews: [{ title: '금서방', verdict: 'unknown' }] },
  ])('does not accept incomplete, mismatched or invented review evidence: %j', async (raw) => {
    await expect(reviewWorldEntries({ ...base, generate: async () => raw })).rejects.toThrow();
  });
  it('does not review empty candidate lists or start after cancellation', async () => {
    const generate = vi.fn();
    expect((await reviewWorldEntries({ ...base, entries: [], generate })).size).toBe(0);
    await expect(reviewWorldEntries({ ...base, generate, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
});
