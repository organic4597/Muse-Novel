import { describe, expect, it } from 'vitest';
import { resolveSelectionRewriteRequest } from './selection-rewrite-prompts';

describe('selection rewrite requests', () => {
  it('passes an author custom instruction only when text is selected', () => {
    expect(resolveSelectionRewriteRequest('  더 냉소적인 어투로 크게 바꿔줘  ', true)).toBe('더 냉소적인 어투로 크게 바꿔줘');
    expect(resolveSelectionRewriteRequest('더 냉소적으로', false)).toBeNull();
  });
});
