import { describe, expect, it } from 'vitest';

import {
  extractBoundedPlateText,
  InvalidPlateContentError,
} from './bounded-plate-content';

describe('bounded Plate content', () => {
  it('extracts nested text iteratively in document order', () => {
    expect(
      extractBoundedPlateText(
        JSON.stringify([
          { children: [{ text: '첫 ' }, { children: [{ text: '문장' }] }] },
          { children: [{ text: '둘째 문장' }] },
        ])
      )
    ).toBe('첫 문장\n둘째 문장');
  });

  it('rejects malformed, non-array and excessive-depth documents', () => {
    expect(() => extractBoundedPlateText('{bad')).toThrow(InvalidPlateContentError);
    expect(() => extractBoundedPlateText('{}')).toThrow(InvalidPlateContentError);
    let node: Record<string, unknown> = { text: '끝' };
    for (let index = 0; index < 70; index += 1) node = { children: [node] };
    expect(() => extractBoundedPlateText(JSON.stringify([node]))).toThrow(
      '너무 크거나 깊습니다'
    );
  });
});

