'use client';

import { normalizeNodeId, type Value } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';
import {
  type ClipboardEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from 'react';

import type { EditorTextStats } from '@/components/editor/editor-content-worker-core';
import { EditorKit } from '@/components/editor/editor-kit';
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import { InlineSuggestionPlugin } from '@/components/editor/plugins/inline-suggestion-plugin';
import { useEditorContentWorker } from '@/components/editor/use-editor-content-worker';
import { Editor, EditorContainer } from '@/components/ui/editor';

import {
  insertOptionalHtmlPaste,
  shouldProcessOptionalHtmlPaste,
  snapshotClipboardHtml,
} from './optional-word-paste';

export interface PlateEditorProps {
  chapterId?: string | null;
  projectId?: string | null;
  content?: string | null;
  onStatsChange?: (stats: EditorTextStats) => void;
  onValueChange?: (content: string) => void;
  ref?: Ref<PlateEditorHandle>;
}

export interface PlateEditorHandle {
  flushProcessing: () => Promise<void>;
  insertText: (text: string) => void;
}

export function PlateEditor({
  chapterId,
  projectId,
  content,
  onStatsChange,
  onValueChange,
  ref,
}: PlateEditorProps) {
  const initialEditorValue = useMemo(
    () => normalizeNodeId(parseEditorContent(content)),
    [chapterId, content]
  );

  const editor = usePlateEditor(
    {
      plugins: EditorKit,
      value: initialEditorValue,
    },
    [chapterId, content]
  );

  const { flush, processValue } = useEditorContentWorker({
    onResult: (result, emitChange) => {
      onStatsChange?.({
        byteSize: result.byteSize,
        characterCount: result.characterCount,
      });

      if (emitChange) onValueChange?.(result.content);
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      flushProcessing: flush,
      insertText: (text: string) => {
        editor.tf.focus();
        if (editor.api.isExpanded()) {
          editor.tf.collapse({ edge: 'end' });
        }
        const fragment = text
          .replace(/\r\n?/gu, '\n')
          .split(/\n+/gu)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph) => ({
            children: [{ text: paragraph }],
            type: 'p',
          }));
        if (fragment.length > 0) {
          editor.tf.insertFragment(fragment);
        }
      },
    }),
    [editor, flush]
  );

  useEffect(() => {
    processValue(initialEditorValue, { emitChange: false });
  }, [initialEditorValue, processValue]);

  useEffect(() => {
    editor.setOption(InlineSuggestionPlugin, 'chapterId', chapterId ?? null);

    const chatOptions = editor.getOptions(aiChatPlugin).chatOptions ?? {};
    editor.setOption(aiChatPlugin, 'chatOptions', {
      ...chatOptions,
      body: {
        ...chatOptions.body,
        ...(projectId ? { projectId } : {}),
        ...(chapterId ? { chapterId } : {}),
      },
    });
  }, [chapterId, editor, projectId]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!shouldProcessOptionalHtmlPaste(event.clipboardData)) return;

      // ClipboardData is only guaranteed to remain readable during this event.
      const clipboard = snapshotClipboardHtml(event.clipboardData);
      event.preventDefault();

      void insertOptionalHtmlPaste(editor, clipboard).catch(() => {
        // Keep pasted prose recoverable even if the optional chunk fails to
        // load. Basic HTML deserialization is part of Plate's core editor.
        const fragment = editor.api.html.deserialize({
          element: clipboard.html,
        });

        if (fragment.length > 0) editor.tf.insertFragment(fragment);
      });
    },
    [editor]
  );

  return (
    <Plate
      editor={editor}
      onValueChange={({ value }) => processValue(value)}
    >
      <EditorContainer variant="writing">
        <Editor onPaste={handlePaste} variant="writing" />
      </EditorContainer>
    </Plate>
  );
}

function parseEditorContent(content?: string | null): Value {
  if (!content) return defaultValue;

  try {
    const value: unknown = JSON.parse(content);
    return Array.isArray(value) && value.length > 0 ? (value as Value) : defaultValue;
  } catch {
    return defaultValue;
  }
}

const defaultValue: Value = [
  {
    children: [{ text: '' }],
    type: 'p',
  },
];
