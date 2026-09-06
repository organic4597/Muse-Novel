import { describe, expect, it } from 'vitest';

import { sanitizeReturnTo } from './redirect';

describe('sanitizeReturnTo', () => {
  it.each([
    ['https://evil.example', '/'],
    ['//evil.example/path', '/'],
    ['javascript:alert(1)', '/'],
    ['/login?returnTo=/secret', '/'],
    ['/setup', '/'],
    [null, '/'],
  ])('rejects unsafe redirect %s', (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected);
  });

  it('keeps same-origin paths, query strings, and fragments', () => {
    expect(sanitizeReturnTo('/projects/one/write?chapter=2#editor')).toBe(
      '/projects/one/write?chapter=2#editor'
    );
  });
});
