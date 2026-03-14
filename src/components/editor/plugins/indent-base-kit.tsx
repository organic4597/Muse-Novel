import { BaseIndentPlugin } from '@platejs/indent';
import { KEYS } from 'platejs';

export const BaseIndentKit = [
  BaseIndentPlugin.configure({
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
      ],
    },
    options: {
      offset: 24,
    },
  }),
];
