import { readFile } from 'fs/promises';
import path from 'path';

import { generateText } from 'ai';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import type { ProviderType } from '@/lib/ai/types';
import type { ProviderConfig } from '@/lib/ai/types';
import { db } from '@/lib/db';
import { getDefaultProvider } from '@/lib/db/queries/ai-settings';
import { getProject } from '@/lib/db/queries/projects';
import {
  getWritingStyleProfile,
  updateWritingStyleProfile,
} from '@/lib/db/queries/writing-style-profiles';

// Max chars sent to AI (prevent huge payloads)
const MAX_SAMPLE_CHARS = 8000;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> }
) {
  const { id, profileId } = await params;

  const project = await getProject(db, id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const profile = await getWritingStyleProfile(db, profileId);
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  if (!profile.filePath) {
    return NextResponse.json(
      { error: '먼저 텍스트 파일을 업로드하세요.' },
      { status: 400 }
    );
  }

  // Read the uploaded .txt file
  const absolutePath = path.join(process.cwd(), 'public', profile.filePath);
  let sampleText: string;
  try {
    const buf = await readFile(absolutePath);
    sampleText = buf.toString('utf-8');
  } catch {
    return NextResponse.json(
      { error: '파일을 읽을 수 없습니다.' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: 'No AI provider configured' },
        { status: 503 }
      );
    }
    providerConfig = envConfig;
    model = createProvider(envConfig);
  }

  try {
    const { text: description } = await generateText({
      model,
      maxOutputTokens: 300,
      providerOptions: providerConfig ? getProviderOptions(providerConfig) : undefined,
      temperature: 0.3,
      system:
        '당신은 소설 문체 분석가입니다. 주어진 텍스트의 문체 특성을 분석하여 2-4문장으로 간결하게 요약하세요. 분석 항목: 문장 길이와 리듬, 서술 시점(1인칭/3인칭 등), 어조(격식/비격식, 건조함/감성적), 묘사 방식, 감정 표현 방식, 특징적인 문법 패턴. 요약문만 출력하세요. 부연 설명이나 인사말 없이.',
      prompt: `다음 소설 텍스트의 문체를 분석하세요:\n\n"""\n${sampleText.slice(0, MAX_SAMPLE_CHARS)}\n"""`,
    });

    const updated = await updateWritingStyleProfile(db, profileId, {
      description,
    });

    return NextResponse.json({ description, profile: updated });
  } catch (error) {
    console.warn('[style-profiles/analyze] AI error:', error);
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }
}
