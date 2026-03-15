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
import { createProvider } from '@/lib/ai/provider-factory';
import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';

import { getChooseToolPrompt, getEditPrompt, getGeneratePrompt } from './prompts';

export async function POST(req: NextRequest) {
  const {
    apiKey: key,
    ctx,
    messages: messagesRaw = [],
    model: modelId,
    provider: providerName,
  } = await req.json();

  const { children, selection, toolName: toolNameParam } = ctx;

  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    selection,
    value: children,
  });

  try {
    const model = createProvider({
      provider: providerName || 'openai',
      modelId: modelId || 'gpt-4o-mini',
      apiKey: key,
    });

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
