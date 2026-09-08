import { describe, expect, it } from 'vitest';

import {
  getTextNoteEditorJson,
  textNoteContentSchema,
  mindMapContentSchema,
  parseAuthorNoteContent,
} from './author-notebook';

describe('author notebook content', () => {
  it('keeps legacy blank lines and preserves rich text through validation', () => {
    const editorJson = getTextNoteEditorJson({ text: '첫 줄\n\n둘째 줄' });
    expect(JSON.parse(editorJson).map((node: { children: { text: string }[] }) => node.children[0].text)).toEqual(['첫 줄', '', '둘째 줄']);
    const rich = JSON.stringify([{ type: 'h2', children: [{ text: '스토리 라인', bold: true, color: '#ff0000' }] }]);
    const saved = textNoteContentSchema.parse({ text: '오래된 텍스트', editorJson: rich });
    expect(saved.text).toBe('스토리 라인');
    expect(saved.editorJson).toBe(rich);
    expect(getTextNoteEditorJson(saved)).toBe(rich);
  });
  it('rejects malformed editor data instead of silently losing formatting', () => {
    expect(textNoteContentSchema.safeParse({ text: '', editorJson: '{broken' }).success).toBe(false);
  });
  it('accepts a connected mind map', () => {
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    const value = mindMapContentSchema.parse({
      edges: [{ from: first, id: crypto.randomUUID(), to: second }],
      nodes: [
        { color: '#8b5cf6', id: first, kind: 'text', text: '주인공', x: 40, y: 50 },
        { color: '#f59e0b', id: second, kind: 'text', text: '목표', x: 340, y: 50 },
      ],
    });

    expect(value.nodes[0].width).toBe(240);
    expect(value.edges).toHaveLength(1);
  });

  it('rejects dangling edges and unsafe image paths', () => {
    const nodeId = crypto.randomUUID();
    expect(() =>
      parseAuthorNoteContent('mindmap', {
        edges: [{ from: nodeId, id: crypto.randomUUID(), to: crypto.randomUUID() }],
        nodes: [
          {
            color: '#8b5cf6',
            id: nodeId,
            imagePath: '/uploads/../secret.png',
            kind: 'image',
            text: '',
            x: 0,
            y: 0,
          },
        ],
      })
    ).toThrow();
  });
});
