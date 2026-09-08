import { describe, expect, it } from 'vitest';

import {
  mindMapContentSchema,
  parseAuthorNoteContent,
} from './author-notebook';

describe('author notebook content', () => {
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
