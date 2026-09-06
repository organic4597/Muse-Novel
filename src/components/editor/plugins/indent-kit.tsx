'use client';

import { IndentPlugin } from '@platejs/indent/react';
import { KEYS } from 'platejs';

export const IndentKit = [
  IndentPlugin.configure({
    shortcuts: {
      indent: null,
    },
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
        KEYS.blockquote,
        KEYS.codeBlock,
        KEYS.toggle,
        KEYS.img,
      ],
    },
    options: {
      offset: 24,
    },
  }),
];
