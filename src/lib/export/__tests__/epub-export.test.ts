import { describe, expect, it } from 'vitest';
import { convertToHtml, generateEpub } from '../export-epub';

describe('convertToHtml', () => {
  it('should convert a paragraph to <p> tag', () => {
    const plateJson = [
      {
        type: 'p',
        children: [{ text: 'Hello world' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<p>Hello world</p>');
  });

  it('should convert h1 heading to <h1> tag', () => {
    const plateJson = [
      {
        type: 'h1',
        children: [{ text: 'Main Title' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<h1>Main Title</h1>');
  });

  it('should convert h2 heading to <h2> tag', () => {
    const plateJson = [
      {
        type: 'h2',
        children: [{ text: 'Section Title' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<h2>Section Title</h2>');
  });

  it('should convert h3 heading to <h3> tag', () => {
    const plateJson = [
      {
        type: 'h3',
        children: [{ text: 'Subsection' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<h3>Subsection</h3>');
  });

  it('should wrap bold text in <strong> tag', () => {
    const plateJson = [
      {
        type: 'p',
        children: [
          { text: 'Hello ' },
          { text: 'world', bold: true },
        ],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('should wrap italic text in <em> tag', () => {
    const plateJson = [
      {
        type: 'p',
        children: [
          { text: 'Hello ' },
          { text: 'world', italic: true },
        ],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<p>Hello <em>world</em></p>');
  });

  it('should handle both bold and italic on same node', () => {
    const plateJson = [
      {
        type: 'p',
        children: [
          { text: 'bold and italic', bold: true, italic: true },
        ],
      },
    ];

    const result = convertToHtml(plateJson);
    // Both bold and italic applied — order: strong wraps em or em inside strong
    expect(result).toContain('bold and italic');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
  });

  it('should handle multiple nodes in one paragraph', () => {
    const plateJson = [
      {
        type: 'p',
        children: [
          { text: 'Normal ' },
          { text: 'bold', bold: true },
          { text: ' normal again' },
        ],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<p>Normal <strong>bold</strong> normal again</p>');
  });

  it('should handle multiple block nodes', () => {
    const plateJson = [
      {
        type: 'h1',
        children: [{ text: 'Title' }],
      },
      {
        type: 'p',
        children: [{ text: 'Content' }],
      },
      {
        type: 'h2',
        children: [{ text: 'Subtitle' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<h1>Title</h1><p>Content</p><h2>Subtitle</h2>');
  });

  it('should handle null input gracefully', () => {
    const result = convertToHtml(null);
    expect(result).toBe('');
  });

  it('should handle undefined input gracefully', () => {
    const result = convertToHtml(undefined);
    expect(result).toBe('');
  });

  it('should handle empty array', () => {
    const result = convertToHtml([]);
    expect(result).toBe('');
  });

  it('should handle JSON string input (from DB)', () => {
    const plateJson = JSON.stringify([
      {
        type: 'p',
        children: [{ text: 'From DB string' }],
      },
    ]);

    const result = convertToHtml(plateJson);
    expect(result).toBe('<p>From DB string</p>');
  });

  it('should handle invalid JSON string gracefully', () => {
    const result = convertToHtml('not valid json');
    expect(result).toBe('');
  });

  it('should handle Korean text', () => {
    const plateJson = [
      {
        type: 'h1',
        children: [{ text: '제1장' }],
      },
      {
        type: 'p',
        children: [{ text: '안녕하세요' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<h1>제1장</h1><p>안녕하세요</p>');
  });

  it('should treat unknown node types as paragraphs', () => {
    const plateJson = [
      {
        type: 'blockquote',
        children: [{ text: 'Quote text' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('<p>Quote text</p>');
  });

  it('should skip nodes with no text', () => {
    const plateJson = [
      {
        type: 'p',
        children: [{ text: '' }],
      },
    ];

    const result = convertToHtml(plateJson);
    expect(result).toBe('');
  });
});

describe('generateEpub', () => {
  it('should return a Buffer', async () => {
    const project = { title: 'Test Book' };
    const chapters = [
      { title: 'Chapter 1', contentJson: JSON.stringify([{ type: 'p', children: [{ text: 'Hello' }] }]) },
    ];

    const result = await generateEpub(project, chapters);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('should return a non-empty Buffer', async () => {
    const project = { title: 'Test Book' };
    const chapters = [
      { title: 'Chapter 1', contentJson: JSON.stringify([{ type: 'p', children: [{ text: 'Hello' }] }]) },
    ];

    const result = await generateEpub(project, chapters);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should return a valid zip (EPUB starts with PK\\x03\\x04)', async () => {
    const project = { title: 'Test Book' };
    const chapters = [
      { title: 'Chapter 1', contentJson: JSON.stringify([{ type: 'p', children: [{ text: 'Content' }] }]) },
    ];

    const result = await generateEpub(project, chapters);
    // EPUB is a ZIP file — first 4 bytes should be PK\x03\x04
    expect(result[0]).toBe(0x50); // P
    expect(result[1]).toBe(0x4b); // K
    expect(result[2]).toBe(0x03);
    expect(result[3]).toBe(0x04);
  });

  it('should handle multiple chapters', async () => {
    const project = { title: 'Multi-Chapter Book', author: '작가' };
    const chapters = [
      { title: '제1장', contentJson: JSON.stringify([{ type: 'p', children: [{ text: '첫 번째 챕터' }] }]) },
      { title: '제2장', contentJson: JSON.stringify([{ type: 'p', children: [{ text: '두 번째 챕터' }] }]) },
      { title: '제3장', contentJson: JSON.stringify([{ type: 'h1', children: [{ text: '세 번째' }] }]) },
    ];

    const result = await generateEpub(project, chapters);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should handle null contentJson gracefully', async () => {
    const project = { title: 'Book with null chapter' };
    const chapters = [
      { title: 'Empty Chapter', contentJson: null },
    ];

    await expect(generateEpub(project, chapters)).resolves.toBeInstanceOf(Buffer);
  });

  it('should handle empty chapters array', async () => {
    const project = { title: 'Empty Book' };
    const chapters: { title: string; contentJson: string | null }[] = [];

    await expect(generateEpub(project, chapters)).resolves.toBeInstanceOf(Buffer);
  });

  it('should use default author when not provided', async () => {
    const project = { title: 'No Author Book' };
    const chapters = [
      { title: 'Chapter 1', contentJson: JSON.stringify([{ type: 'p', children: [{ text: 'Content' }] }]) },
    ];

    // Should not throw
    await expect(generateEpub(project, chapters)).resolves.toBeInstanceOf(Buffer);
  });

  it('should use provided author', async () => {
    const project = { title: 'My Book', author: '홍길동' };
    const chapters = [
      { title: 'Chapter 1', contentJson: JSON.stringify([{ type: 'p', children: [{ text: 'Content' }] }]) },
    ];

    // Should not throw
    await expect(generateEpub(project, chapters)).resolves.toBeInstanceOf(Buffer);
  });

  it('should handle chapters with mixed null and non-null content', async () => {
    const project = { title: 'Mixed Book' };
    const chapters = [
      { title: 'Chapter 1', contentJson: JSON.stringify([{ type: 'p', children: [{ text: 'Has content' }] }]) },
      { title: 'Chapter 2', contentJson: null },
      { title: 'Chapter 3', contentJson: JSON.stringify([{ type: 'h2', children: [{ text: 'Back to content' }] }]) },
    ];

    const result = await generateEpub(project, chapters);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
