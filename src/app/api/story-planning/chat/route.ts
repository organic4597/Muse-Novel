import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';

import { db } from '@/lib/db';
import { getGlobalDefaultProvider } from '@/lib/db/queries/ai-settings';
import { createProvider } from '@/lib/ai/provider-factory';
import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { buildStoryPlanningMessages, parseStoryPlanningResponse } from '@/lib/ai/story-planning-prompt';
import type { StoryPlanningDraft, StoryPlanningMessage } from '@/lib/ai/story-planning-types';
import { EMPTY_DRAFT } from '@/lib/ai/story-planning-types';
import type { ProviderConfig } from '@/lib/ai/types';

async function resolveProvider(): Promise<ProviderConfig | null> {
  // 1. Global AI settings (projectId IS NULL)
  const globalSetting = await getGlobalDefaultProvider(db);
  if (globalSetting) {
    return {
      provider: globalSetting.providerType as ProviderConfig['provider'],
      modelId: globalSetting.modelName ?? '',
      apiKey: globalSetting.apiKeyEncrypted ?? undefined,
      baseUrl: globalSetting.baseUrl ?? undefined,
      contextSize: globalSetting.contextSize ?? undefined,
    };
  }

  // 2. Env variable fallback
  return getEnvProviderConfig();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages: StoryPlanningMessage[] = body.messages ?? [];
    const currentDraft: StoryPlanningDraft = body.draft ?? EMPTY_DRAFT;

    if (messages.length === 0) {
      return NextResponse.json(
        { error: '메시지가 비어있습니다.' },
        { status: 400 }
      );
    }

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') {
      return NextResponse.json(
        { error: '마지막 메시지는 user 역할이어야 합니다.' },
        { status: 400 }
      );
    }

    const providerConfig = await resolveProvider();
    if (!providerConfig) {
      return NextResponse.json(
        { error: 'no_provider', message: 'AI 설정이 필요합니다. 공용 AI 설정을 먼저 구성해주세요.' },
        { status: 422 }
      );
    }

    const model = createProvider(providerConfig);
    const aiMessages = buildStoryPlanningMessages(messages, currentDraft);

    const { text } = await generateText({
      model,
      messages: aiMessages,
      maxOutputTokens: 2000,
      temperature: 0.7,
    });

    const parsed = parseStoryPlanningResponse(text, currentDraft);

    return NextResponse.json({
      reply: parsed.reply,
      draft: parsed.draft,
    });
  } catch (error) {
    console.error('[story-planning/chat] Error:', error);
    return NextResponse.json(
      { error: 'AI 응답 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
