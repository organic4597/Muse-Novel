'use client';

import { useCalloutEmojiPicker } from '@platejs/callout/react';
import { useEmojiDropdownMenuState } from '@platejs/emoji/react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import {
  EmojiPicker,
  EmojiPopover,
} from '@/components/ui/emoji-toolbar-button';

export interface CalloutEmojiButtonProps {
  icon?: string;
  openOnMount?: boolean;
}

export function CalloutEmojiButton({
  icon,
  openOnMount = false,
}: CalloutEmojiButtonProps) {
  const { emojiPickerState, isOpen, setIsOpen } =
    useEmojiDropdownMenuState({ closeOnSelect: true });
  const didOpenOnMount = useRef(false);

  const { emojiToolbarDropdownProps, props: calloutProps } =
    useCalloutEmojiPicker({
      isOpen,
      setIsOpen,
    });

  useEffect(() => {
    if (!openOnMount || didOpenOnMount.current) return;

    didOpenOnMount.current = true;
    setIsOpen(true);
  }, [openOnMount, setIsOpen]);

  return (
    <EmojiPopover
      {...emojiToolbarDropdownProps}
      control={
        <Button
          className="size-6 select-none p-1 text-[18px] hover:bg-muted-foreground/15"
          contentEditable={false}
          style={{
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
          }}
          type="button"
          variant="ghost"
        >
          {icon || '💡'}
        </Button>
      }
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      <EmojiPicker {...emojiPickerState} {...calloutProps} />
    </EmojiPopover>
  );
}
