'use client';

import { normalizeNodeId } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import { InlineSuggestionPlugin } from '@/components/editor/plugins/inline-suggestion-plugin';
import { Editor, EditorContainer } from '@/components/ui/editor';

interface PlateEditorProps {
  chapterId?: string | null;
  projectId?: string | null;
  content?: string | null;
  onValueChange?: (content: string) => void;
}

export function PlateEditor({ chapterId, projectId, content, onValueChange }: PlateEditorProps) {
  const editorValue = content ? JSON.parse(content) : defaultValue;

  const editor = usePlateEditor({
    plugins: EditorKit,
    value: normalizeNodeId(editorValue),
  });

  if (chapterId !== undefined) {
    editor.setOption(InlineSuggestionPlugin, 'chapterId', chapterId ?? null);
  }

  if (projectId || chapterId) {
    const chatOptions = editor.getOptions(aiChatPlugin).chatOptions ?? {};
    editor.setOption(aiChatPlugin, 'chatOptions', {
      ...chatOptions,
      body: {
        ...chatOptions.body,
        ...(projectId ? { projectId } : {}),
        ...(chapterId ? { chapterId } : {}),
      },
    });
  }

  return (
    <Plate
      editor={editor}
      onValueChange={onValueChange ? ({ value }) => onValueChange(JSON.stringify(value)) : undefined}
    >
      <EditorContainer variant="writing">
        <Editor variant="writing" />
      </EditorContainer>
    </Plate>
  );
}

const defaultValue = [
  {
    children: [{ text: '' }],
    type: 'p',
  },
];
