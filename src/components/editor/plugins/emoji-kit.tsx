'use client';

import { EmojiInputPlugin, EmojiPlugin } from '@platejs/emoji/react';

import { EmojiInputElement } from '@/components/ui/emoji-node';

export const EmojiKit = [
  // Plate's tiny built-in fallback keeps the plugin synchronous. The full
  // emoji-mart catalog is attached only when an emoji feature is first used.
  EmojiPlugin,
  EmojiInputPlugin.withComponent(EmojiInputElement),
];
