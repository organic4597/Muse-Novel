'use client';

import { type UseChatHelpers, useChat as useBaseChat } from '@ai-sdk/react';
import { AIChatPlugin } from '@platejs/ai/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEditorRef, usePluginOption } from 'platejs/react';
import * as React from 'react';

import { aiChatPlugin } from '@/components/editor/plugins/ai-kit';
import { useWritingKnowledgeWorker } from '@/hooks/use-writing-knowledge-worker';
import { resolveSelectionRewriteRequest } from '@/lib/ai/selection-rewrite-prompts';

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
  const writingKnowledge = useWritingKnowledgeWorker();

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
        const rewriteInstruction = resolveSelectionRewriteRequest(lastUserText, editor.api.isExpanded());
        let knowledgeDocumentIds: string[] | undefined;
        if (lastUserText.trim()) {
          try {
            const searchResult = await Promise.race([
              writingKnowledge.search(lastUserText, { limit: 5 }),
              new Promise<null>((resolve) => {
                setTimeout(() => resolve(null), 700);
              }),
            ]);
            if (searchResult) {
              knowledgeDocumentIds = searchResult.matches.map((match) => match.id);
            }
          } catch {
            // The server-side retrieval loop remains the safe fallback.
          }
        }
        const requestContext =
          initBody?.ctx && typeof initBody.ctx === 'object'
            ? initBody.ctx
            : {};
        const inferredToolName: ToolName = editor.api.isExpanded()
          ? 'edit'
          : 'generate';

        const body = {
          ...initBody,
          ...bodyOptions,
          ctx: {
            ...requestContext,
            toolName: requestContext.toolName ?? inferredToolName,
          },
          knowledgeDocumentIds,
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
