'use client';

import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
  WandSparklesIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorReadOnly } from 'platejs/react';

import { AIToolbarButton } from './ai-toolbar-button';
import { LinkToolbarButton } from './link-toolbar-button';
import { MarkToolbarButton } from './mark-toolbar-button';
import { MoreToolbarButton } from './more-toolbar-button';
import { ToolbarGroup } from './toolbar';
import { TurnIntoToolbarButton } from './turn-into-toolbar-button';

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <>
      {!readOnly && (
        <>
          <ToolbarGroup>
            <AIToolbarButton tooltip="AI 도우미">
              <WandSparklesIcon />
              AI에게 질문
            </AIToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <TurnIntoToolbarButton />

            <MarkToolbarButton nodeType={KEYS.bold} tooltip="굵게 (⌘+B)">
              <BoldIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.italic} tooltip="기울임 (⌘+I)">
              <ItalicIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.underline}
              tooltip="밑줄 (⌘+U)"
            >
              <UnderlineIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip="취소선 (⌘+⇧+M)"
            >
              <StrikethroughIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.code} tooltip="코드 (⌘+E)">
              <Code2Icon />
            </MarkToolbarButton>

            <LinkToolbarButton />
          </ToolbarGroup>
        </>
      )}

      <ToolbarGroup>
        {!readOnly && <MoreToolbarButton />}
      </ToolbarGroup>
    </>
  );
}
