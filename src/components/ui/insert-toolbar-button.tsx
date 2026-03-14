'use client';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  PlusIcon,
  QuoteIcon,
  SquareIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { type PlateEditor, useEditorRef } from 'platejs/react';
import * as React from 'react';
import {
  insertBlock,
  insertInlineElement,
} from '@/components/editor/transforms';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { ToolbarButton, ToolbarMenuGroup } from './toolbar';

type Group = {
  group: string;
  items: Item[];
};

type Item = {
  icon: React.ReactNode;
  value: string;
  onSelect: (editor: PlateEditor, value: string) => void;
  focusEditor?: boolean;
  label?: string;
};

const groups: Group[] = [
  {
    group: '기본 블록',
    items: [
      {
        icon: <PilcrowIcon />,
        label: '문단',
        value: KEYS.p,
      },
      {
        icon: <Heading1Icon />,
        label: '제목 1',
        value: 'h1',
      },
      {
        icon: <Heading2Icon />,
        label: '제목 2',
        value: 'h2',
      },
      {
        icon: <Heading3Icon />,
        label: '제목 3',
        value: 'h3',
      },
      {
        icon: <QuoteIcon />,
        label: '인용',
        value: KEYS.blockquote,
      },
      {
        icon: <MinusIcon />,
        label: '구분선',
        value: KEYS.hr,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: '목록',
    items: [
      {
        icon: <ListIcon />,
        label: '글머리 기호',
        value: KEYS.ul,
      },
      {
        icon: <ListOrderedIcon />,
        label: '번호 목록',
        value: KEYS.ol,
      },
      {
        icon: <SquareIcon />,
        label: '할 일 목록',
        value: KEYS.listTodo,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: '인라인',
    items: [
      {
        icon: <Link2Icon />,
        label: '링크',
        value: KEYS.link,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertInlineElement(editor, value);
      },
    })),
  },
];

export function InsertToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu modal={false} onOpenChange={setOpen} open={open} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton isDropdown pressed={open} tooltip="삽입">
          <PlusIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="flex max-h-[500px] min-w-0 flex-col overflow-y-auto"
      >
        {groups.map(({ group, items: nestedItems }) => (
          <ToolbarMenuGroup key={group} label={group}>
            {nestedItems.map(({ icon, label, value, onSelect }) => (
              <DropdownMenuItem
                className="min-w-[180px]"
                key={value}
                onSelect={() => {
                  onSelect(editor, value);
                  editor.tf.focus();
                }}
              >
                {icon}
                {label}
              </DropdownMenuItem>
            ))}
          </ToolbarMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
