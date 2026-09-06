import { describe, expect, it } from 'vitest';
import { convertToMarkdown } from '../export-md';
import { convertToPlainText } from '../export-text';

describe('Plain Text Export', () => {
  it('should convert simple paragraph to plain text', () => {
    const plateJson = [
      {
        type: 'p',
        children: [{ text: 'Hello world' }],
      },
    ];

    const result = convertToPlainText(plateJson);
    expect(result).toBe('Hello world');
  });

  it('should handle multiple paragraphs', () => {
    const plateJson = [
      {
        type: 'p',
        children: [{ text: 'First paragraph' }],
      },
      {
        type: 'p',
        children: [{ text: 'Second paragraph' }],
      },
    ];

    const result = convertToPlainText(plateJson);
    expect(result).toBe('First paragraph\nSecond paragraph');
  });

  it('should handle heading nodes', () => {
    const plateJson = [
      {
        type: 'h1',
        children: [{ text: 'Main Title' }],
      },
      {
        type: 'p',
        children: [{ text: 'Content' }],
      },
    ];

    const result = convertToPlainText(plateJson);
    expect(result).toBe('Main Title\nContent');
  });

  it('should handle h2 and h3 headings', () => {
    const plateJson = [
      {
        type: 'h2',
        children: [{ text: 'Section' }],
      },
      {
        type: 'h3',
        children: [{ text: 'Subsection' }],
      },
    ];

    const result = convertToPlainText(plateJson);
    expect(result).toBe('Section\nSubsection');
  });

  it('should handle empty contentJson (null)', () => {
    const result = convertToPlainText(null);
    expect(result).toBe('');
  });

  it('should handle empty array', () => {
    const result = convertToPlainText([]);
    expect(result).toBe('');
  });

  it('should extract text from nested children', () => {
    const plateJson = [
      {
        type: 'p',
        children: [
          { text: 'Part 1 ' },
          { text: 'Part 2', bold: true },
          { text: ' Part 3' },
        ],
      },
    ];

    const result = convertToPlainText(plateJson);
    expect(result).toBe('Part 1 Part 2 Part 3');
  });

  it('should handle mixed content types', () => {
    const plateJson = [
      {
        type: 'h1',
        children: [{ text: '제1장' }],
      },
      {
        type: 'p',
        children: [{ text: '안녕하세요' }],
      },
      {
        type: 'h2',
        children: [{ text: '소제목' }],
      },
      {
        type: 'p',
        children: [{ text: '본문 내용' }],
      },
    ];

    const result = convertToPlainText(plateJson);
    const lines = result.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('제1장');
    expect(lines[1]).toBe('안녕하세요');
    expect(lines[2]).toBe('소제목');
    expect(lines[3]).toBe('본문 내용');
  });
});

describe('Markdown Export', () => {
  it('should convert paragraph to markdown', () => {
    const plateJson = [
      {
        type: 'p',
        children: [{ text: 'Hello world' }],
      },
    ];

    const result = convertToMarkdown(plateJson);
    expect(result).toContain('Hello world');
  });

  it('should convert h1 heading to markdown', () => {
    const plateJson = [
      {
        type: 'h1',
        children: [{ text: 'Main Title' }],
      },
    ];

    const result = convertToMarkdown(plateJson);
    expect(result).toContain('# Main Title');
  });

  it('should convert h2 heading to markdown', () => {
    const plateJson = [
      {
        type: 'h2',
        children: [{ text: 'Section' }],
      },
    ];

    const result = convertToMarkdown(plateJson);
    expect(result).toContain('## Section');
  });

  it('should convert h3 heading to markdown', () => {
    const plateJson = [
      {
        type: 'h3',
        children: [{ text: 'Subsection' }],
      },
    ];

    const result = convertToMarkdown(plateJson);
    expect(result).toContain('### Subsection');
  });

  it('should handle null contentJson', () => {
    const result = convertToMarkdown(null);
    expect(result).toBe('');
  });

  it('should handle empty array', () => {
    const result = convertToMarkdown([]);
    expect(result).toBe('');
  });

  it('should handle multiple paragraphs', () => {
    const plateJson = [
      {
        type: 'p',
        children: [{ text: 'First paragraph' }],
      },
      {
        type: 'p',
        children: [{ text: 'Second paragraph' }],
      },
    ];

    const result = convertToMarkdown(plateJson);
    expect(result).toContain('First paragraph');
    expect(result).toContain('Second paragraph');
  });

  it('should handle mixed heading and paragraph content', () => {
    const plateJson = [
      {
        type: 'h1',
        children: [{ text: '제목' }],
      },
      {
        type: 'p',
        children: [{ text: '단락 내용' }],
      },
      {
        type: 'h2',
        children: [{ text: '소제목' }],
      },
      {
        type: 'p',
        children: [{ text: '더 많은 내용' }],
      },
    ];

    const result = convertToMarkdown(plateJson);
    expect(result).toContain('# 제목');
    expect(result).toContain('단락 내용');
    expect(result).toContain('## 소제목');
    expect(result).toContain('더 많은 내용');
  });
});

describe('Multi-chapter Export Integration', () => {
  it('should concatenate multiple chapters with proper ordering', () => {
    // This tests the concept that when we export a project,
    // we join chapters in order
    const chapter1 = [
      {
        type: 'h1',
        children: [{ text: '제1장' }],
      },
      {
        type: 'p',
        children: [{ text: '첫 번째 챕터' }],
      },
    ];

    const chapter2 = [
      {
        type: 'h1',
        children: [{ text: '제2장' }],
      },
      {
        type: 'p',
        children: [{ text: '두 번째 챕터' }],
      },
    ];

    const text1 = convertToPlainText(chapter1);
    const text2 = convertToPlainText(chapter2);
    const combined = `${text1}\n\n${text2}`;

    const lines = combined.split('\n');
    expect(lines[0]).toBe('제1장');
    expect(lines[1]).toBe('첫 번째 챕터');
    expect(lines[3]).toBe('제2장');
    expect(lines[4]).toBe('두 번째 챕터');
  });
});
