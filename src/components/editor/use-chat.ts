'use client';

import { type UseChatHelpers, useChat as useBaseChat } from '@ai-sdk/react';
import { AIChatPlugin } from '@platejs/ai/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEditorRef, usePluginOption } from 'platejs/react';
import * as React from 'react';

import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import { resolveSelectionRewriteInstruction } from '@/lib/ai/selection-rewrite-prompts';

const PROJECT_PATH_REGEX = /\/projects\/([^/]+)/;

export type ToolName = 'edit' | 'generate';

export type MessageDataPart = {
  toolName: ToolName;
};

export type Chat = UseChatHelpers<ChatMessage>;

export type ChatMessage = UIMessage<{}, MessageDataPart>;

export const useChat = () => {
  const editor = useEditorRef();
  const options = usePluginOption(aiChatPlugin, 'chatOptions');

  const baseChat = useBaseChat<ChatMessage>({
    id: 'editor',
    transport: new DefaultChatTransport({
      api: options.api || '/api/ai/command',
      fetch: (async (input, init) => {
        const bodyOptions = editor.getOptions(aiChatPlugin).chatOptions?.body;

        const initBody = JSON.parse(init?.body as string);
        const projectIdMatch =
          typeof window !== 'undefined'
            ? window.location.pathname.match(PROJECT_PATH_REGEX)
            : null;
        const projectId = projectIdMatch?.[1] ?? null;
        const lastUserMessage = Array.isArray(initBody?.messages)
          ? initBody.messages.at(-1)
          : null;
        const lastUserText = Array.isArray(lastUserMessage?.parts)
          ? lastUserMessage.parts
              .filter(
                (
                  part
                ): part is {
                  text: string;
                  type: 'text';
                } => part?.type === 'text' && typeof part.text === 'string'
              )
              .map((part) => part.text)
              .join('')
          : '';
        const rewriteInstruction = resolveSelectionRewriteInstruction(lastUserText);

        const body = {
          ...initBody,
          ...bodyOptions,
          projectId,
          rewriteInstruction,
        };

        const res = await fetch(input, {
          ...init,
          body: JSON.stringify(body),
        });

        return res;
      }) as typeof fetch,
    }),
    onData(data) {
      if (data.type === 'data-toolName') {
        editor.setOption(AIChatPlugin, 'toolName', data.data);
      }
    },

    ...options,
  });

  const chat = {
    ...baseChat,
  };

  React.useEffect(() => {
    editor.setOption(AIChatPlugin, 'chat', chat as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.status, chat.messages, chat.error]);

  return chat;
};
