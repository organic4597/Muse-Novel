import { describe, expect, it } from 'vitest';

import { serializeEditorContext } from '@/lib/ai/serialize-editor-context';

describe('serializeEditorContext', () => {
  it('Plate JSON에서 평문 텍스트를 추출한다', () => {
    const plateJson = JSON.stringify([
      { type: 'p', children: [{ text: '첫 번째 문단입니다.' }] },
      { type: 'p', children: [{ text: '두 번째 문단입니다.' }] },
    ]);

    const { prefix, suffix } = serializeEditorContext(plateJson);

    expect(prefix).toContain('첫 번째 문단입니다.');
    expect(prefix).toContain('두 번째 문단입니다.');
    expect(suffix).toBe('');
  });

  it('cursorOffset으로 prefix와 suffix를 분리한다', () => {
    const plateJson = JSON.stringify([
      { type: 'p', children: [{ text: '앞부분 텍스트입니다.' }] },
      { type: 'p', children: [{ text: '뒷부분 텍스트입니다.' }] },
    ]);

    const fullText = '앞부분 텍스트입니다.\n뒷부분 텍스트입니다.';
    const cursorOffset = '앞부분 텍스트입니다.\n'.length;

    const { prefix, suffix } = serializeEditorContext(plateJson, cursorOffset);

    expect(prefix).toBe('앞부분 텍스트입니다.\n');
    expect(suffix).toBe('뒷부분 텍스트입니다.');
  });

  it('긴 콘텐츠를 maxContext 길이로 잘라낸다', () => {
    const longText = '가'.repeat(5000);
    const plateJson = JSON.stringify([
      { type: 'p', children: [{ text: longText }] },
    ]);

    const { prefix, suffix } = serializeEditorContext(plateJson, undefined, 100);

    expect(prefix.length).toBeLessThanOrEqual(100);
    // Prefix should be the LAST maxContext chars (tail)
    expect(prefix).toBe(longText.slice(-100));
  });

  it('빈 콘텐츠를 처리한다', () => {
    const { prefix, suffix } = serializeEditorContext('');

    expect(prefix).toBe('');
    expect(suffix).toBe('');
  });

  it('빈 배열 JSON을 처리한다', () => {
    const { prefix, suffix } = serializeEditorContext('[]');

    expect(prefix).toBe('');
    expect(suffix).toBe('');
  });

  it('중첩된 노드에서 텍스트를 추출한다', () => {
    const plateJson = JSON.stringify([
      {
        type: 'p',
        children: [
          { text: '일반 텍스트 ' },
          { text: '굵은 텍스트', bold: true },
          { text: ' 이어서.' },
        ],
      },
    ]);

    const { prefix } = serializeEditorContext(plateJson);

    expect(prefix).toBe('일반 텍스트 굵은 텍스트 이어서.');
  });

  it('잘못된 JSON은 빈 결과를 반환한다', () => {
    const { prefix, suffix } = serializeEditorContext('invalid json {{{');

    expect(prefix).toBe('');
    expect(suffix).toBe('');
  });

  it('suffix를 500자로 제한한다', () => {
    const longText = '나'.repeat(3000);
    const plateJson = JSON.stringify([
      { type: 'p', children: [{ text: longText }] },
    ]);

    const { suffix } = serializeEditorContext(plateJson, 10);

    expect(suffix.length).toBeLessThanOrEqual(500);
  });

  it('cursorOffset이 텍스트 길이를 초과하면 모두 prefix로 처리한다', () => {
    const plateJson = JSON.stringify([
      { type: 'p', children: [{ text: '짧은 텍스트' }] },
    ]);

    const { prefix, suffix } = serializeEditorContext(plateJson, 9999);

    expect(prefix).toBe('짧은 텍스트');
    expect(suffix).toBe('');
  });
});
