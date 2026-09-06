'use client';

import type { Emoji, EmojiMartData } from '@emoji-mart/data';
import type { PlateEditor } from 'platejs/react';

let emojiDataPromise: Promise<EmojiMartData> | null = null;

/**
 * Keep the roughly 480 KB emoji catalog out of the initial editor chunk.
 * The promise is shared by the toolbar, callouts, and inline `:` completion.
 */
export function loadEmojiData(): Promise<EmojiMartData> {
  emojiDataPromise ??= import('@emoji-mart/data').then(
    ({ default: emojiData }) => emojiData as EmojiMartData
  );

  emojiDataPromise.catch(() => {
    emojiDataPromise = null;
  });

  return emojiDataPromise;
}

export async function loadEmojiDataIntoEditor(editor: PlateEditor) {
  const [emojiData, { EmojiPlugin }] = await Promise.all([
    loadEmojiData(),
    import('@platejs/emoji/react'),
  ]);

  editor.setOption(EmojiPlugin, 'data', emojiData);
}

export function searchEmojiData(
  data: EmojiMartData,
  query: string,
  limit = 60
): Emoji[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return [];

  return Object.values(data.emojis)
    .map((emoji) => ({
      emoji,
      score: [emoji.id, emoji.name, ...emoji.keywords]
        .join(',')
        .toLowerCase()
        .indexOf(normalizedQuery),
    }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) =>
      left.score === right.score
        ? left.emoji.id.localeCompare(right.emoji.id)
        : left.score - right.score
    )
    .slice(0, limit)
    .map(({ emoji }) => emoji);
}
