import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  Output,
  streamText,
} from 'ai';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createSlateEditor } from 'platejs';
import { z } from 'zod';
import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import type { ChatMessage, ToolName } from '@/components/editor/use-chat';
import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { buildStoryContext } from '@/lib/ai/build-story-context';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import { createProvider } from '@/lib/ai/provider-factory';
import { db } from '@/lib/db';
import { getDefaultProvider } from '@/lib/db/queries/ai-settings';
import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';

import { getChooseToolPrompt, getEditPrompt, getGeneratePrompt } from './prompts';

export async function POST(req: NextRequest) {
  const {
    apiKey: key,
    chapterId,
    ctx,
    messages: messagesRaw = [],
    model: modelId,
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
      const providerSettings = await getDefaultProvider(db, projectId);

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

    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        let toolName = toolNameParam;

        if (!toolName) {
          const result = await generateText({
            model,
            output: Output.choice({
              options: ['generate', 'edit'] as const,
            }),
            prompt: getChooseToolPrompt(messagesRaw),
          });

          const AIToolName = result.output as ToolName;

          writer.write({
            data: AIToolName,
            type: 'data-toolName',
          });

          toolName = AIToolName;
        }

        const textStream = streamText({
          experimental_transform: markdownJoinerTransform(),
          model,
          prompt: '',
          ...(storyContext ? { system: storyContext } : {}),
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

        writer.merge(textStream.toUIMessageStream({ sendFinish: false }));
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return NextResponse.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}
