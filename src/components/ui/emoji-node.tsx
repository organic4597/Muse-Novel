'use client';

import {
  DEFAULT_EMOJI_LIBRARY,
  insertEmoji,
} from '@platejs/emoji';
import { EmojiPlugin } from '@platejs/emoji/react';
import type { PlateElementProps } from 'platejs/react';
import { PlateElement, usePluginOption } from 'platejs/react';
import * as React from 'react';

import {
  loadEmojiDataIntoEditor,
  searchEmojiData,
} from '@/components/editor/load-emoji-data';
import { useDebounce } from '@/hooks/use-debounce';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

const TRAILING_COLON_REGEX = /:$/;

export function EmojiInputElement(props: PlateElementProps) {
  const { children, editor, element } = props;
  const data =
    usePluginOption(EmojiPlugin, 'data') ?? DEFAULT_EMOJI_LIBRARY;
  const [value, setValue] = React.useState('');
  const debouncedValue = useDebounce(value, 100);
  const isPending = value !== debouncedValue;

  React.useEffect(() => {
    void loadEmojiDataIntoEditor(editor).catch(() => undefined);
  }, [editor]);

  const filteredEmojis = React.useMemo(() => {
    if (debouncedValue.trim().length === 0) return [];

    return searchEmojiData(
      data,
      debouncedValue.replace(TRAILING_COLON_REGEX, '')
    );
  }, [data, debouncedValue]);

  return (
    <PlateElement as="span" {...props}>
      <InlineCombobox
        element={element}
        filter={false}
        hideWhenNoValue
        setValue={setValue}
        trigger=":"
        value={value}
      >
        <InlineComboboxInput />

        <InlineComboboxContent>
          {!isPending && <InlineComboboxEmpty>No results</InlineComboboxEmpty>}

          <InlineComboboxGroup>
            {filteredEmojis.map((emoji) => (
              <InlineComboboxItem
                key={emoji.id}
                onClick={() => insertEmoji(editor, emoji)}
                value={emoji.name}
              >
                {emoji.skins[0].native} {emoji.name}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
