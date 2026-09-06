import { describe, expect, it } from 'vitest';

import { extractTextFromPlateJson } from '../character-mentions';

describe('extractTextFromPlateJson', () => {
  it('should return empty string for null input', () => {
    expect(extractTextFromPlateJson(null)).toBe('');
  });

  it('should return empty string for empty string input', () => {
    expect(extractTextFromPlateJson('')).toBe('');
  });

  it('should return empty string for invalid JSON', () => {
    expect(extractTextFromPlateJson('not valid json')).toBe('');
  });

  it('should extract text from simple Plate JSON with text nodes', () => {
    const json = JSON.stringify([
      {
        type: 'p',
        children: [{ text: '안녕하세요' }],
      },
    ]);
    expect(extractTextFromPlateJson(json)).toBe('안녕하세요');
  });

  it('should extract text from multiple paragraphs', () => {
    const json = JSON.stringify([
      {
        type: 'p',
        children: [{ text: '첫 번째 문단' }],
      },
      {
        type: 'p',
        children: [{ text: '두 번째 문단' }],
      },
    ]);
    expect(extractTextFromPlateJson(json)).toBe('첫 번째 문단두 번째 문단');
  });

  it('should extract text from deeply nested nodes', () => {
    const json = JSON.stringify([
      {
        type: 'p',
        children: [
          { text: '굵은 ' },
          {
            type: 'bold',
            children: [{ text: '텍스트' }],
          },
          { text: ' 여기' },
        ],
      },
    ]);
    expect(extractTextFromPlateJson(json)).toBe('굵은 텍스트 여기');
  });

  it('should return empty string for non-array JSON', () => {
    const json = JSON.stringify({ type: 'p', children: [{ text: '텍스트' }] });
    // Non-array root parsed as object — extractTextFromNodes handles non-arrays gracefully
    expect(extractTextFromPlateJson(json)).toBe('');
  });

  it('should return empty string for empty array', () => {
    expect(extractTextFromPlateJson('[]')).toBe('');
  });

  it('should handle nodes without children and without text', () => {
    const json = JSON.stringify([
      { type: 'hr' },
      { type: 'p', children: [{ text: '실제 텍스트' }] },
    ]);
    expect(extractTextFromPlateJson(json)).toBe('실제 텍스트');
  });

  it('should detect character name in extracted text', () => {
    const characterName = '김철수';
    const json = JSON.stringify([
      {
        type: 'p',
        children: [
          { text: `${characterName}은 조용히 방에 들어갔다.` },
        ],
      },
    ]);
    const text = extractTextFromPlateJson(json);
    expect(text).toContain(characterName);
  });
});
