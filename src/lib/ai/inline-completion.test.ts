import { describe, expect, it } from 'vitest';

import {
  buildInlineCompletionSystemPrompt,
  buildInlineCompletionUserPrompt,
  normalizeInlineCompletion,
} from './inline-completion';

describe('inline completion prompt and normalization', () => {
  it('includes both cursor prefix and suffix', () => {
    const prompt = buildInlineCompletionUserPrompt({
      prefix: '그녀는 문을 열었다.',
      suffix: '복도 끝에서 발소리가 들렸다.',
    });

    expect(prompt).toContain('그녀는 문을 열었다.');
    expect(prompt).toContain('<CURSOR>');
    expect(prompt).toContain('복도 끝에서 발소리가 들렸다.');
    expect(prompt).toContain('<prefix>');
    expect(prompt).toContain('<suffix>');
  });

  it('defines continuity and output-only quality criteria', () => {
    const prompt = buildInlineCompletionSystemPrompt({
      prefix: '그녀는 문을 열었다.',
      suffix: '',
      storyContext: '그녀는 형사를 피해 도망치는 중이다.',
    });

    expect(prompt).toContain('선택 우선순위');
    expect(prompt).toContain('본문만 출력');
    expect(prompt).toContain('<story_bible>');
  });

  it('removes labels, thinking blocks, and context echo', () => {
    const result = normalizeInlineCompletion(
      '<think>분석</think>다음 문장: 문을 열었다. 차가운 바람이 얼굴을 스쳤다.',
      { prefix: '그녀는 문을 열었다.', suffix: '' }
    );

    expect(result).toBe(' 차가운 바람이 얼굴을 스쳤다.');
  });

  it('removes overlap with the suffix', () => {
    const result = normalizeInlineCompletion(
      '그는 숨을 죽였다. 발소리가 가까워졌다.',
      { prefix: '어둠 속에서', suffix: '발소리가 가까워졌다.' }
    );

    expect(result).toBe(' 그는 숨을 죽였다.');
  });

  it('does not duplicate punctuation already present after the cursor', () => {
    const result = normalizeInlineCompletion('바람이 스며들었다.', {
      prefix: '그는 고개를 들었다',
      suffix: '. 다음 순간 문이 열렸다.',
    });

    expect(result).toBe(' 바람이 스며들었다');
  });

  it('rejects repetitive and meta responses', () => {
    expect(
      normalizeInlineCompletion('계속 계속 계속 계속', {
        prefix: '그는',
        suffix: '',
      })
    ).toBe('');
    expect(
      normalizeInlineCompletion('다음 문장은 이렇게 작성할 수 있습니다.', {
        prefix: '그는',
        suffix: '',
      })
    ).toBe('');
  });
});
