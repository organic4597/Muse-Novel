'use client';

import type { SlateEditor, TComboboxInputElement, TMentionElement } from 'platejs';
import { getEditorPlugin, IS_APPLE, KEYS } from 'platejs';

import type { PlateElementProps } from 'platejs/react';
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
} from 'platejs/react';
import { Globe, User } from 'lucide-react';
import * as React from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { useMounted } from '@/hooks/use-mounted';
import { cn } from '@/lib/utils';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

type MentionItem = {
  id: string;
  text: string;
  category: 'character' | 'world';
};

export function MentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const element = props.element;

  const selected = useSelected();
  const focused = useFocused();
  const mounted = useMounted();
  const readOnly = useReadOnly();

  const category = (element as Record<string, unknown>).category as
    | string
    | undefined;

  const isCharacter = category === 'character';
  const isWorld = category === 'world';

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'data-slate-value': element.value,
        draggable: true,
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 align-baseline font-medium text-sm',
        isCharacter && 'bg-green-100 text-green-800',
        isWorld && 'bg-blue-100 text-blue-800',
        !isCharacter && !isWorld && 'bg-muted',
        !readOnly && 'cursor-pointer',
        selected && focused && 'ring-2 ring-ring',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
    >
      {mounted && IS_APPLE ? (
        // Mac OS IME https://github.com/ianstormtaylor/slate/issues/3490
        <>
          {props.children}
          {isCharacter && <User className="size-3.5" />}
          {isWorld && <Globe className="size-3.5" />}
          {props.prefix}
          {element.value}
        </>
      ) : (
        // Others like Android https://github.com/ianstormtaylor/slate/pull/5360
        <>
          {isCharacter && <User className="size-3.5" />}
          {isWorld && <Globe className="size-3.5" />}
          {props.prefix}
          {element.value}
          {props.children}
        </>
      )}
    </PlateElement>
  );
}

function getProjectIdFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

function onSelectItem(
  editor: SlateEditor,
  item: { key: string; text: string; category: string },
  search: string
) {
  const { getOptions } = getEditorPlugin(editor, {
    key: KEYS.mention,
  });
  const { insertSpaceAfterMention } = getOptions() as {
    insertSpaceAfterMention?: boolean;
  };

  editor.tf.insertNodes({
    type: KEYS.mention,
    key: item.key,
    value: item.text,
    category: item.category,
    children: [{ text: '' }],
  });

  editor.tf.move({ unit: 'offset' });

  const pathAbove = editor.api.block()?.[1];

  if (
    editor.selection &&
    pathAbove &&
    editor.api.isEnd(editor.selection.anchor, pathAbove) &&
    insertSpaceAfterMention
  ) {
    editor.tf.insertText(' ');
  }
}

export function MentionInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const [items, setItems] = React.useState<MentionItem[]>([]);
  const debouncedSearch = useDebounce(search, 300);

  React.useEffect(() => {
    const projectId = getProjectIdFromPath();
    if (!projectId) return;

    const url = `/api/projects/${projectId}/mentions?q=${encodeURIComponent(debouncedSearch)}`;

    fetch(url)
      .then((res) => res.json())
      .then((data: { items: MentionItem[] }) => {
        setItems(data.items);
      })
      .catch(() => {
        setItems([]);
      });
  }, [debouncedSearch]);

  const characterItems = items.filter((item) => item.category === 'character');
  const worldItems = items.filter((item) => item.category === 'world');

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        element={element}
        filter={false}
        setValue={setSearch}
        showTrigger={false}
        trigger="@"
        value={search}
      >
        <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm ring-ring focus-within:ring-2">
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          <InlineComboboxEmpty>항목이 없습니다</InlineComboboxEmpty>

          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>캐릭터</InlineComboboxGroupLabel>
            {characterItems.map((item) => (
              <InlineComboboxItem
                key={item.id}
                onClick={() =>
                  onSelectItem(
                    editor as never,
                    { key: item.id, text: item.text, category: 'character' },
                    search
                  )
                }
                value={item.text}
              >
                <User className="size-4 text-green-500 mr-1.5" />
                {item.text}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>

          <InlineComboboxGroup>
            <InlineComboboxGroupLabel>세계관</InlineComboboxGroupLabel>
            {worldItems.map((item) => (
              <InlineComboboxItem
                key={item.id}
                onClick={() =>
                  onSelectItem(
                    editor as never,
                    { key: item.id, text: item.text, category: 'world' },
                    search
                  )
                }
                value={item.text}
              >
                <Globe className="size-4 text-blue-500 mr-1.5" />
                {item.text}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
