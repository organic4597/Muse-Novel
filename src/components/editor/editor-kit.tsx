'use client';

import { TrailingBlockPlugin, type Value } from 'platejs';
import { type TPlateEditor, useEditorRef } from 'platejs/react';

import { AIKit } from '@/components/editor/plugins/ai-kit';
import { AlignKit } from '@/components/editor/plugins/align-kit';
import { AutoformatKit } from '@/components/editor/plugins/autoformat-kit';
import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { BlockMenuKit } from '@/components/editor/plugins/block-menu-kit';
import { BlockPlaceholderKit } from '@/components/editor/plugins/block-placeholder-kit';
import { CalloutKit } from '@/components/editor/plugins/callout-kit';
import { CursorOverlayKit } from '@/components/editor/plugins/cursor-overlay-kit';
import { DndKit } from '@/components/editor/plugins/dnd-kit';
import { DocxKit } from '@/components/editor/plugins/docx-kit';
import { EmojiKit } from '@/components/editor/plugins/emoji-kit';
import { ExitBreakKit } from '@/components/editor/plugins/exit-break-kit';
import { FixedToolbarKit } from '@/components/editor/plugins/fixed-toolbar-kit';
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit';
import { FontKit } from '@/components/editor/plugins/font-kit';
import { InlineSuggestionKit } from '@/components/editor/plugins/inline-suggestion-plugin';
import { LineHeightKit } from '@/components/editor/plugins/line-height-kit';
import { LinkKit } from '@/components/editor/plugins/link-kit';
import { ListKit } from '@/components/editor/plugins/list-kit';
import { MarkdownKit } from '@/components/editor/plugins/markdown-kit';
import { MentionKit } from '@/components/editor/plugins/mention-kit';
import { SlashKit } from '@/components/editor/plugins/slash-kit';

export const EditorKit = [
  ...InlineSuggestionKit,
  ...AIKit,

  // Elements
  ...BasicBlocksKit,
  ...CalloutKit,
  ...LinkKit,
  ...MentionKit,

  // Marks
  ...BasicMarksKit,
  ...FontKit,

  // Block Style
  ...ListKit,
  ...AlignKit,
  ...LineHeightKit,

  // Editing
  ...SlashKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockMenuKit,
  ...DndKit,
  ...EmojiKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // Parsers
  ...DocxKit,

  // UI
  ...BlockPlaceholderKit,
  ...FixedToolbarKit,
  ...FloatingToolbarKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
