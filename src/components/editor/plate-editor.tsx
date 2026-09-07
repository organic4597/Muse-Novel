'use client';

import { normalizeNodeId, TextApi, type TRange, type Value } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';
import {
  type ClipboardEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';

import type { EditorTextStats } from '@/components/editor/editor-content-worker-core';
import { EditorKit } from '@/components/editor/editor-kit';
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import {
  getCursorAwareContext,
  InlineSuggestionPlugin,
} from '@/components/editor/plugins/inline-suggestion-plugin';
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
  ghostTextEnabled?: boolean;
  ref?: Ref<PlateEditorHandle>;
}

export interface PlateEditorHandle {
  flushProcessing: () => Promise<void>;
  getCursorContext: () => { before: string; after: string };
  insertText: (text: string) => void;
  replaceText: (original: string, replacement: string) => boolean;
}

type IndexedTextEntry = readonly [{ text: string }, number[]];

export function findUniqueEditorTextRange(
  entries: IndexedTextEntry[],
  original: string
): TRange | null {
  if (!original) return null;
  const roots = new Map<
    number,
    Array<{ node: { text: string }; path: number[] }>
  >();
  for (const [node, path] of entries) {
    const rootIndex = path[0];
    if (typeof rootIndex !== 'number') continue;
    const rootEntries = roots.get(rootIndex) ?? [];
    rootEntries.push({ node, path });
    roots.set(rootIndex, rootEntries);
  }

  let documentText = '';
  const segments: Array<{
    end: number;
    path: number[];
    start: number;
  }> = [];
  let hasContent = false;
  for (const rootEntries of roots.values()) {
    const rootText = rootEntries.map((entry) => entry.node.text).join('');
    if (!rootText) continue;
    if (hasContent) documentText += '\n';
    hasContent = true;
    for (const entry of rootEntries) {
      const start = documentText.length;
      documentText += entry.node.text;
      segments.push({ end: documentText.length, path: entry.path, start });
    }
  }

  const startOffset = documentText.indexOf(original);
  if (
    startOffset < 0 ||
    documentText.indexOf(original, startOffset + original.length) >= 0
  ) {
    return null;
  }
  const endOffset = startOffset + original.length;
  const startSegment = segments.find(
    (segment) => startOffset >= segment.start && startOffset <= segment.end
  );
  const endSegment = [...segments]
    .reverse()
    .find((segment) => endOffset >= segment.start && endOffset <= segment.end);
  if (!startSegment || !endSegment) return null;

  return {
    anchor: {
      offset: startOffset - startSegment.start,
      path: startSegment.path,
    },
    focus: {
      offset: endOffset - endSegment.start,
      path: endSegment.path,
    },
  };
}

export function PlateEditor({
  chapterId,
  projectId,
  content,
  onStatsChange,
  onValueChange,
  ghostTextEnabled = true,
  ref,
}: PlateEditorProps) {
  const initialEditorValue = useMemo(
    () => normalizeNodeId(parseEditorContent(content)),
    [chapterId]
  );

  const editor = usePlateEditor(
    {
      plugins: EditorKit,
      value: initialEditorValue,
    },
    [chapterId]
  );
  const lastSelectionRef = useRef<TRange | null>(null);

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
      getCursorContext: () => {
        const context = getCursorAwareContext(
          editor,
          editor.selection ?? lastSelectionRef.current
        );
        return {
          after: context?.suffix ?? '',
          before: context?.prefix ?? '',
        };
      },
      insertText: (text: string) => {
        const selection = editor.selection ?? lastSelectionRef.current;
        editor.tf.focus(selection ? { at: selection } : undefined);
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
      replaceText: (original: string, replacement: string) => {
        if (!original || original === replacement) return false;
        const entries: IndexedTextEntry[] = [];
        for (const [node, path] of editor.api.nodes({
          at: [],
          match: (candidate) => TextApi.isText(candidate),
        })) {
          if (!TextApi.isText(node)) continue;
          entries.push([node, [...path]]);
        }
        const range = findUniqueEditorTextRange(entries, original);
        if (!range) return false;
        editor.tf.select(range);
        if (replacement.includes('\n')) {
          editor.tf.delete();
          const fragment = replacement
            .replace(/\r\n?/gu, '\n')
            .split(/\n+/gu)
            .map((paragraph) => paragraph.trim())
            .filter(Boolean)
            .map((paragraph) => ({
              children: [{ text: paragraph }],
              type: 'p',
            }));
          if (fragment.length > 0) editor.tf.insertFragment(fragment);
        } else if (replacement) {
          editor.tf.insertText(replacement);
        } else {
          editor.tf.delete();
        }
        editor.tf.focus();
        return true;
      },
    }),
    [editor, flush]
  );

  useEffect(() => {
    processValue(initialEditorValue, { emitChange: false });
  }, [initialEditorValue, processValue]);

  useEffect(() => {
    editor.setOption(InlineSuggestionPlugin, 'chapterId', chapterId ?? null);
    editor.setOption(InlineSuggestionPlugin, 'enabled', ghostTextEnabled);
    if (!ghostTextEnabled) editor.getApi(InlineSuggestionPlugin).inlineSuggestion.clearSuggestion();

    const chatOptions = editor.getOptions(aiChatPlugin).chatOptions ?? {};
    editor.setOption(aiChatPlugin, 'chatOptions', {
      ...chatOptions,
      body: {
        ...chatOptions.body,
        ...(projectId ? { projectId } : {}),
        ...(chapterId ? { chapterId } : {}),
      },
    });
  }, [chapterId, editor, ghostTextEnabled, projectId]);

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
      onSelectionChange={({ selection }) => { if (selection) lastSelectionRef.current = selection; }}
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
