import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import {
  createUploadWebPath,
  getUploadWritePath,
} from '@/lib/uploads/storage';

import { Automatic1111Client } from './automatic1111-client';
import { DiffusersApiClient } from './diffusers-api-client';
import { buildCharacterPrompt, buildDefaultNegativePrompt } from './prompt-builder';
import { buildKoreanCharacterTexts, translateToTags } from './tag-translator';
import type {
  CharacterPromptContext,
  ImageGenerationTimings,
  ImageKind,
} from './types';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_DIFFUSERS_MODEL,
  SHOT_PRESETS,
} from './types';

export interface ImageProviderConfig {
  providerType: string;
  baseUrl?: string | null;
  modelName?: string | null;
  defaultWidth?: number | null;
  defaultHeight?: number | null;
  defaultSteps?: number | null;
  defaultSampler?: string | null;
  defaultCfgScale?: number | null;
  defaultNegativePrompt?: string | null;
}

export interface GenerateImagesParams {
  character: CharacterPromptContext & { id: string };
  projectId: string;
  kind: ImageKind;
  additionalPrompt?: string;
  batchSize?: number;
  provider: ImageProviderConfig;
  onProgress?: (event: {
    type: 'status' | 'progress';
    status?: string;
    message?: string;
    step?: number;
    totalSteps?: number;
    progress?: number;
    elapsed?: number;
    stage?: string;
    durationMs?: number;
    timings?: ImageGenerationTimings;
  }) => void;
  loraId?: string;
  loraWeight?: number;
  tagServiceBaseUrl?: string;
}

export interface SavedImage {
  filePath: string; // relative web path, e.g. /uploads/characters/<cid>/<uuid>.png
  seed: number;
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
}

/**
 * Generate character images and save them to disk.
 * Supports both diffusers (subprocess) and automatic1111 (API) providers.
 */
export async function generateCharacterImages(
  params: GenerateImagesParams
): Promise<SavedImage[]> {
  const { character, kind, additionalPrompt, provider, onProgress } = params;
  const preset = SHOT_PRESETS[kind];
  const batchSize = params.batchSize ?? DEFAULT_BATCH_SIZE[kind];

  // Auto-translate Korean character fields to English Danbooru tags
  let autoTranslatedTags: string[] = [];
  const koreanTexts = buildKoreanCharacterTexts(character);
  if (koreanTexts) {
    onProgress?.({ type: 'status', status: 'translating', message: '캐릭터 설명을 태그로 변환 중...' });
    const translationStart = performance.now();
    const translated = await translateToTags(
      koreanTexts,
      20,
      0.3,
      params.tagServiceBaseUrl
    );
    const translationMs = Math.round(performance.now() - translationStart);
    autoTranslatedTags = translated.map(t => t.tag);
    onProgress?.({
      type: 'status',
      status: 'translating_complete',
      message: `태그 변환 완료 (${(translationMs / 1000).toFixed(1)}초)`,
      stage: 'translation',
      durationMs: translationMs,
      timings: { translationMs },
    });
  }

  const prompt = buildCharacterPrompt(character, kind, additionalPrompt, autoTranslatedTags);
  const negativePrompt = buildDefaultNegativePrompt(kind, provider.defaultNegativePrompt);

  const width = provider.defaultWidth ?? preset.width;
  const height = provider.defaultHeight ?? preset.height;
  const steps = provider.defaultSteps ?? 20;
  const cfgScale = provider.defaultCfgScale ?? 7;

  if (!provider.baseUrl) {
    throw new Error('이미지 생성 API Base URL을 먼저 등록하세요.');
  }

  const sampler = provider.defaultSampler ?? 'Euler a';
  const generationStart = performance.now();
  const generationRequest = {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      sampler,
      cfgScale,
      batchSize,
      modelName: provider.modelName || DEFAULT_DIFFUSERS_MODEL,
      loraId: params.loraId,
      loraWeight: params.loraWeight,
  };
  const result =
    provider.providerType === 'diffusers'
      ? await new DiffusersApiClient(provider.baseUrl).generate(
          generationRequest
        )
      : provider.providerType === 'automatic1111'
        ? await new Automatic1111Client(provider.baseUrl).txt2img(
            generationRequest
          )
        : null;

  if (!result) {
    throw new Error(`지원되지 않는 이미지 생성 제공자: ${provider.providerType}`);
  }

  const generationMs = Math.round(performance.now() - generationStart);

  onProgress?.({
    type: 'status',
    status: 'saving',
    message: '이미지 저장 중...',
    stage: 'generation',
    durationMs: generationMs,
    timings: { generationMs },
  });

  const savedImages: SavedImage[] = [];
  const imageSaveStart = performance.now();
  for (const img of result.images) {
    const filename = `${crypto.randomUUID()}.png`;
    const buffer = Buffer.from(img.base64, 'base64');
    const filePath = createUploadWebPath(
      'characters',
      character.id,
      'generated',
      filename
    );
    const absolutePath = getUploadWritePath(filePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    savedImages.push({
      filePath,
      seed: img.seed,
      width: img.width,
      height: img.height,
      prompt: result.prompt,
      negativePrompt: result.negativePrompt,
    });
  }

  const imageSaveMs = Math.round(performance.now() - imageSaveStart);
  onProgress?.({
    type: 'status',
    status: 'provider_complete',
    message: '이미지 API 호출 완료',
    stage: 'image_save',
    durationMs: imageSaveMs,
    timings: {
      generationMs,
      imageSaveMs,
      totalMs: generationMs + imageSaveMs,
    },
  });

  return savedImages;
}

/** Build a preview prompt without running generation */
export function previewPrompt(params: {
  character: CharacterPromptContext;
  kind: ImageKind;
  additionalPrompt?: string;
  providerNegativePrompt?: string | null;
  autoTranslatedTags?: string[];
}): { prompt: string; negativePrompt: string } {
  const {
    character,
    kind,
    additionalPrompt,
    providerNegativePrompt,
    autoTranslatedTags,
  } = params;

  return {
    prompt: buildCharacterPrompt(character, kind, additionalPrompt, autoTranslatedTags),
    negativePrompt: buildDefaultNegativePrompt(kind, providerNegativePrompt),
  };
}
