import { describe, expect, it } from 'vitest';
import { buildCriticPairs, buildCriticComparisonPrompt, selectComparedSuggestions, type CriticComparison } from './critic-comparison';
import type { ManuscriptCriticSuggestion } from './manuscript-critic';

const original = '정파 놈들이 먼저 산맥 초입에 접근했다고 하네.';
const prose = `무림인들의 대화가 들려왔다.\n"${original}"\n곽진봉은 그들의 시선이 자신에게 닿지 않도록 몸을 숨겼다.\n그는 밤이 깊어지자 흉터의 통증을 참았다.`;
const bad: ManuscriptCriticSuggestion = {
  original,
  replacement: `${original} 곽진봉은 속으로 되뇌었다. 냉기가 손끝을 타고 올라왔다. 흉터의 통증이 스몄다.`,
  category: 'dialogue', scope: 'sentence', confidence: 0.99,
  reason: '감각을 더해 긴장을 강화합니다.',
};

function decision(id: string, preferred: string): CriticComparison['decisions'][number] {
  return { id, preferred, preservesFacts: true, preservesSpeaker: true,
    fitsSurroundings: true, avoidsNewRepetition: true, reason: '중복 주어를 덜어 자연스럽게 이어집니다.' };
}

describe('critic contextual comparison', () => {
  it('includes quote boundaries and subsequent action but hides the candidate self-rating', () => {
    const pairs = buildCriticPairs(prose, [bad]);
    expect(pairs[0].before.endsWith('"')).toBe(true);
    expect(pairs[0].after.startsWith('"')).toBe(true);
    const prompt = buildCriticComparisonPrompt(prose, '무림인 시점', pairs);
    expect(prompt).toContain('몸을 숨겼다');
    expect(prompt).toContain('흉터의 통증');
    expect(prompt).not.toContain('confidence');
    expect(prompt).not.toContain(bad.reason);
  });

  it('rejects a high-confidence expansion when the comparison detects changed speaker', () => {
    const pairs = buildCriticPairs(prose, [bad]);
    expect(selectComparedSuggestions(pairs, { decisions: [
      { ...decision('edit-1', 'B'), preservesSpeaker: false },
    ] })).toEqual([]);
  });

  it('rejects ties, missing/duplicate verdicts and duplication with nearby prose', () => {
    const pairs = buildCriticPairs(prose, [bad]);
    for (const decisions of [[], [decision('edit-1', 'tie')],
      [decision('edit-1', 'B'), decision('edit-1', 'B')],
      [{ ...decision('edit-1', 'B'), avoidsNewRepetition: false }]]) {
      expect(selectComparedSuggestions(pairs, { decisions })).toEqual([]);
    }
  });

  it('maps reordered A/B verdicts to the correct original and never rewrites approved text', () => {
    const second = { ...bad, original: '그는 문을 열었다. 그는 안으로 들어갔다.',
      replacement: '문을 연 그는 안으로 들어갔다.', scope: 'paragraph' as const };
    const pairs = buildCriticPairs(`${prose}\n${second.original}`, [bad, second]);
    const result = selectComparedSuggestions(pairs, { decisions: [
      decision('edit-2', 'A'), decision('edit-1', 'A'),
    ] });
    expect(result).toHaveLength(1);
    expect(result[0].replacement).toBe(second.replacement);
    expect(result[0].original).toBe(second.original);
  });
});
