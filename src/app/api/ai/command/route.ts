import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
} from 'ai';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createSlateEditor } from 'platejs';
import { z } from 'zod';
import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import type { ChatMessage, ToolName } from '@/components/editor/use-chat';
import { buildStoryContext } from '@/lib/ai/build-story-context';
import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { buildEditorAssistantSystemPrompt } from '@/lib/ai/prompt-foundations';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import {
  isAIRequestQueueFullError,
  runAIRequest,
} from '@/lib/ai/request-scheduler';
import { db } from '@/lib/db';
import {
  getDefaultProvider,
  getGlobalDefaultProvider,
} from '@/lib/db/queries/ai-settings';
import {
  buildWritingKnowledgeContextFromDocuments,
  getWritingKnowledgeDocument,
  runWritingKnowledgeAgent,
} from '@/lib/knowledge/writing-knowledge';
import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';

import { getEditPrompt, getGeneratePrompt } from './prompts';
import { getTextFromMessage } from './utils';

const REQUEST_TIMEOUT_MS = 600_000;

export function getAICommandStreamError(error: unknown) {
  if (isAIRequestQueueFullError(error)) return error.message;
  const errorName =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : '';
  if (errorName === 'AbortError' || errorName === 'TimeoutError') {
    return 'AI 요청이 취소되었거나 응답 시간이 초과되었습니다.';
  }
  return 'AI 응답 중 오류가 발생했습니다.';
}

export async function POST(req: NextRequest) {
  const {
    apiKey: key,
    chapterId,
    ctx,
    messages: messagesRaw = [],
    model: modelId,
    knowledgeDocumentIds: rawKnowledgeDocumentIds,
    projectId,
    provider: providerName,
    rewriteInstruction,
  } = await req.json();

  if (!ctx) {
    return NextResponse.json(
      { error: 'Missing editor context' },
      { status: 400 }
    );
  }

  const { children, selection, toolName: toolNameParam } = ctx;

  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    selection,
    value: children,
  });

  try {
    let providerConfig;

    if (providerName || modelId || key) {
      providerConfig = {
        apiKey: key,
        modelId: modelId || 'gpt-4o-mini',
        provider: providerName || 'openai',
      };
    } else if (projectId) {
      const providerSettings =
        await getDefaultProvider(db, projectId) ??
        await getGlobalDefaultProvider(db);

      if (providerSettings) {
        providerConfig = resolveStoredProviderConfig(providerSettings, {
          decryptApiKey,
        });
      }
    }

    if (!providerConfig) {
      const envConfig = getEnvProviderConfig();

      if (!envConfig) {
        return NextResponse.json(
          { error: 'No AI provider configured' },
          { status: 503 }
        );
      }

      providerConfig = envConfig;
    }

    const model = createProvider(providerConfig);

    const storyContext = projectId
      ? await buildStoryContext(db, projectId, chapterId ?? undefined)
      : '';
    const latestMessage = messagesRaw.at(-1);
    const knowledgeInstruction = [
      latestMessage ? getTextFromMessage(latestMessage) : '',
      rewriteInstruction ?? '',
    ].filter(Boolean).join(' ');
    const genre = storyContext.match(/^장르:\s*(.+)$/mu)?.[1]?.trim() ?? '';
    const knowledgeDocumentIds = Array.isArray(rawKnowledgeDocumentIds)
      ? Array.from(new Set(
          rawKnowledgeDocumentIds.filter(
            (id): id is string => typeof id === 'string' && id.length <= 200
          )
        )).slice(0, 10)
      : [];
    const verifiedKnowledgeDocuments = knowledgeDocumentIds
      .map((id) => getWritingKnowledgeDocument(id))
      .filter((document): document is NonNullable<typeof document> => Boolean(document));
    const writingReference = verifiedKnowledgeDocuments.length > 0
      ? buildWritingKnowledgeContextFromDocuments(
          verifiedKnowledgeDocuments,
          `${knowledgeInstruction}\n${storyContext.slice(-1000)}`,
          2200
        )
      : runWritingKnowledgeAgent({
          genre,
          instruction: knowledgeInstruction || '현재 장면을 이어서 작성',
          maxChars: 2200,
          storyContext,
        }).context;

    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        const toolName: ToolName = toolNameParam ?? (
          editor.api.isExpanded() ? 'edit' : 'generate'
        );

        writer.write({
          data: toolName,
          type: 'data-toolName',
        });

        await runAIRequest(
          providerConfig,
          {
            priority: 'interactive',
            projectId: typeof projectId === 'string' ? projectId : undefined,
            requestId: req.headers.get('x-request-id') ?? undefined,
            signal: AbortSignal.any([
              req.signal,
              AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            ]),
          },
          async (abortSignal) => {
            const textStream = streamText({
              abortSignal,
              experimental_transform: markdownJoinerTransform(),
              model,
              prompt: '',
              providerOptions: getProviderOptions(providerConfig),
              system: buildEditorAssistantSystemPrompt(
                storyContext,
                writingReference
              ),
              temperature: 0.7,
              ...(providerConfig.provider === 'qwen-local'
                ? { presencePenalty: 0.4, topP: 0.8 }
                : {}),
              prepareStep: async (step) => {
                if (toolName === 'edit') {
                  const editPrompt = getEditPrompt(editor, {
                    isSelecting: editor.api.isExpanded(),
                    messages: messagesRaw,
                  });

                  return {
                    ...step,
                    activeTools: [],
                    messages: [
                      {
                        content: editPrompt,
                        role: 'user',
                      },
                    ],
                  };
                }

                if (toolName === 'generate') {
                  const generatePrompt = getGeneratePrompt(editor, {
                    messages: messagesRaw,
                    rewriteInstruction,
                  });

                  return {
                    ...step,
                    activeTools: [],
                    messages: [
                      {
                        content: generatePrompt,
                        role: 'user',
                      },
                    ],
                    model,
                  };
                }
              },
            });
            const uiStream = textStream.toUIMessageStream<ChatMessage>({
              onError: getAICommandStreamError,
              sendFinish: false,
            });
            const reader = uiStream.getReader();

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                writer.write(value);
              }
            } finally {
              reader.releaseLock();
            }
          }
        );
      },
      onError: getAICommandStreamError,
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}
