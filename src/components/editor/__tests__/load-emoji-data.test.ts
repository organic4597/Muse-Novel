import type { EmojiMartData } from '@emoji-mart/data';
import type { PlateEditor } from 'platejs/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  data: {
    aliases: {},
    categories: [{ emojis: ['rabbit', 'black_cat'], id: 'nature' }],
    emojis: {
      black_cat: {
        id: 'black_cat',
        keywords: ['pet', 'night'],
        name: 'Black Cat',
        skins: [{ native: '🐈‍⬛' }],
      },
      rabbit: {
        id: 'rabbit',
        keywords: ['bunny', 'animal'],
        name: 'Rabbit Face',
        skins: [{ native: '🐰' }],
      },
    },
  },
  emojiPlugin: { key: 'emoji' },
}));

vi.mock('@emoji-mart/data', () => ({ default: mocks.data }));
vi.mock('@platejs/emoji/react', () => ({
  EmojiPlugin: mocks.emojiPlugin,
}));

import {
  loadEmojiData,
  loadEmojiDataIntoEditor,
  searchEmojiData,
} from '../load-emoji-data';

describe('lazy emoji data', () => {
  it('shares one lazy catalog request', async () => {
    const first = loadEmojiData();
    const second = loadEmojiData();

    expect(first).toBe(second);
    await expect(first).resolves.toBe(mocks.data);
  });

  it('attaches the loaded catalog to the current editor', async () => {
    const setOption = vi.fn();
    const editor = { setOption } as unknown as PlateEditor;

    await loadEmojiDataIntoEditor(editor);

    expect(setOption).toHaveBeenCalledWith(
      mocks.emojiPlugin,
      'data',
      mocks.data
    );
  });

  it('searches the current catalog without Plate singleton state', () => {
    const data = mocks.data as unknown as EmojiMartData;

    expect(searchEmojiData(data, 'rabbit').map((emoji) => emoji.id)).toEqual([
      'rabbit',
    ]);
    expect(searchEmojiData(data, 'night').map((emoji) => emoji.id)).toEqual([
      'black_cat',
    ]);
    expect(searchEmojiData(data, 'a', 1)).toHaveLength(1);
  });
});
