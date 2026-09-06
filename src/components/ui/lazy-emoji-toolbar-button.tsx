'use client';

import { SmileIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEditorRef } from 'platejs/react';
import { useState } from 'react';

import { loadEmojiDataIntoEditor } from '@/components/editor/load-emoji-data';
import { ToolbarButton } from '@/components/ui/toolbar';

const EmojiToolbarButton = dynamic(
  () =>
    import('@/components/ui/emoji-toolbar-button').then(
      (module) => module.EmojiToolbarButton
    ),
  { ssr: false }
);

export function LazyEmojiToolbarButton() {
  const editor = useEditorRef();
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  if (isReady) return <EmojiToolbarButton openOnMount />;

  return (
    <ToolbarButton
      aria-label="이모지"
      disabled={isLoading}
      onClick={async () => {
        if (isLoading) return;

        setIsLoading(true);

        try {
          await loadEmojiDataIntoEditor(editor);
          setIsReady(true);
        } catch {
          // A chunk load can fail during a deployment. Leave the trigger
          // enabled so the user can retry without reloading the editor.
        } finally {
          setIsLoading(false);
        }
      }}
      tooltip={isLoading ? '이모지 불러오는 중' : '이모지'}
      type="button"
    >
      <SmileIcon className={isLoading ? 'animate-pulse' : undefined} />
    </ToolbarButton>
  );
}
