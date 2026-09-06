import { describe, expect, it } from 'vitest';

import { processEditorContent } from '../editor-content-worker-core';

describe('processEditorContent', () => {
  it('serializes a Plate value and computes matching plain-text statistics', () => {
    const value = [
      {
        children: [
          { text: '검은 토끼는 ' },
          { bold: true, text: '소림사' },
          { text: '를 올려다봤다.' },
        ],
        type: 'p',
      },
      {
        children: [{ text: '🐇 다음 여정이 시작됐다.' }],
        type: 'p',
      },
    ];

    const result = processEditorContent(value);

    expect(JSON.parse(result.content)).toEqual(value);
    expect(result.plainText).toBe(
      '검은 토끼는 소림사를 올려다봤다.\n🐇 다음 여정이 시작됐다.'
    );
    expect(result.characterCount).toBe(result.plainText.length);
    expect(result.byteSize).toBe(new TextEncoder().encode(result.plainText).length);
  });

  it('keeps the exporter semantics for nested nodes and empty blocks', () => {
    const result = processEditorContent([
      { children: [{ text: '' }], type: 'p' },
      {
        children: [
          {
            children: [{ text: '중첩된 문장' }],
            type: 'span',
          },
        ],
        type: 'blockquote',
      },
    ]);

    expect(result.plainText).toBe('중첩된 문장');
    expect(result.characterCount).toBe(6);
  });

  it('rejects a value that cannot be serialized', () => {
    expect(() => processEditorContent(undefined)).toThrow(
      '편집기 내용을 JSON으로 변환할 수 없습니다.'
    );
  });

  it('processes a multi-megabyte manuscript within a coarse regression budget', () => {
    const paragraph =
      '검은 토끼는 먼 산맥을 바라보며 다음 여정에서 지켜야 할 약속과 아직 풀리지 않은 단서를 차분히 되짚었다.';
    const value = Array.from({ length: 20_000 }, (_, index) => ({
      children: [{ text: `${index + 1}. ${paragraph}` }],
      type: 'p',
    }));

    const startedAt = performance.now();
    const result = processEditorContent(value);
    const durationMs = performance.now() - startedAt;

    expect(result.plainText).toContain(`20000. ${paragraph}`);
    expect(result.byteSize).toBeGreaterThan(3_000_000);
    // Intentionally generous: this catches accidental quadratic processing,
    // not minor CI hardware differences. Production runs the same work in a Worker.
    expect(durationMs).toBeLessThan(8000);
  });
});
