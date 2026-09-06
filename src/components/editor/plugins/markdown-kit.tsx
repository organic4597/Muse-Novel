import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm, remarkMdx, remarkMention],
    },
  }),
];
