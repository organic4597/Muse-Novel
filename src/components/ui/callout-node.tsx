'use client';

import dynamic from 'next/dynamic';
import { PlateElement, useEditorRef } from 'platejs/react';
import type * as React from 'react';
import { useState } from 'react';

import { loadEmojiDataIntoEditor } from '@/components/editor/load-emoji-data';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CalloutEmojiButton = dynamic(
  () =>
    import('@/components/ui/callout-emoji-button').then(
      (module) => module.CalloutEmojiButton
    ),
  { ssr: false }
);

function LazyCalloutEmojiButton({ icon }: { icon?: string }) {
  const editor = useEditorRef();
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  if (isReady) {
    return <CalloutEmojiButton icon={icon} openOnMount />;
  }

  return (
    <Button
      aria-label="콜아웃 이모지 변경"
      className="size-6 select-none p-1 text-[18px] hover:bg-muted-foreground/15"
      contentEditable={false}
      disabled={isLoading}
      onClick={async () => {
        if (isLoading) return;

        setIsLoading(true);

        try {
          await loadEmojiDataIntoEditor(editor);
          setIsReady(true);
        } catch {
          // Leave the trigger enabled so a transient chunk failure is retryable.
        } finally {
          setIsLoading(false);
        }
      }}
      style={{
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
      }}
      type="button"
      variant="ghost"
    >
      {icon || '💡'}
    </Button>
  );
}

export function CalloutElement({
  attributes,
  children,
  className,
  ...props
}: React.ComponentProps<typeof PlateElement>) {
  return (
    <PlateElement
      attributes={{
        ...attributes,
        'data-plate-open-context-menu': true,
      }}
      className={cn('my-1 flex rounded-sm bg-muted p-4 pl-3', className)}
      style={{
        backgroundColor: props.element.backgroundColor as any,
      }}
      {...props}
    >
      <div className="flex w-full gap-2 rounded-md">
        <LazyCalloutEmojiButton icon={props.element.icon as string | undefined} />
        <div className="w-full">{children}</div>
      </div>
    </PlateElement>
  );
}
