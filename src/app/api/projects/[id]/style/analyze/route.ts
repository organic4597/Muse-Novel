import { generateText } from 'ai';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import type { ProviderConfig, ProviderType } from '@/lib/ai/types';
import { db } from '@/lib/db';
import { getDefaultProvider } from '@/lib/db/queries/ai-settings';
import { getProject, updateProject } from '@/lib/db/queries/projects';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { sampleText } = (await req.json()) as { sampleText: string };

  if (!sampleText?.trim()) {
    return NextResponse.json({ error: 'sampleText is required' }, { status: 400 });
  }

  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const providerSettings = await getDefaultProvider(db, id);

  let providerConfig: ProviderConfig | null = null;
  let model;
  if (providerSettings) {
    providerConfig = resolveStoredProviderConfig(providerSettings, {
      decryptApiKey,
    });
    model = createProvider(providerConfig);
  } else {
    const envConfig = getEnvProviderConfig();
    if (!envConfig) {
      return NextResponse.json({ error: 'No AI provider configured' }, { status: 503 });
    }
    providerConfig = envConfig;
    model = createProvider(envConfig);
  }

  try {
    const { text: description } = await generateText({
      model,
      maxOutputTokens: 200,
      providerOptions: providerConfig ? getProviderOptions(providerConfig) : undefined,
      temperature: 0.3,
      system:
        '당신은 소설 문체 분석가입니다. 주어진 텍스트의 문체 특성을 분석하여 2-3문장으로 간결하게 요약하세요. 분석 항목: 문장 길이와 리듬, 서술 시점(1인칭/3인칭 등), 어조(격식/비격식, 건조함/감성적), 묘사 방식, 감정 표현 방식, 특징적인 문법 패턴. 요약문만 출력하세요. 부연 설명이나 인사말 없이.',
      prompt: `다음 소설 텍스트의 문체를 분석하세요:\n\n"""\n${sampleText.slice(0, 3000)}\n"""`,
    });

    await updateProject(db, id, {
      writingStyleSample: sampleText,
      writingStyleDescription: description,
    });

    return NextResponse.json({ description });
  } catch (error) {
    console.warn('[style/analyze] AI error:', error);
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }
}
