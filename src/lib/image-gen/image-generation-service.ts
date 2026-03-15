import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { getImageGenGpus } from '../gpu-config';
import { Automatic1111Client } from './automatic1111-client';
import { generateWithDiffusers, type ProgressEvent } from './diffusers-client';
import { buildCharacterPrompt, buildDefaultNegativePrompt } from './prompt-builder';
import { buildKoreanCharacterTexts, translateToTags } from './tag-translator';
import type {
  CharacterPromptContext,
  ImageKind,
} from './types';
import { DEFAULT_BATCH_SIZE, DEFAULT_DIFFUSERS_MODEL, SHOT_PRESETS } from './types';

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
  onProgress?: (event: ProgressEvent) => void;
  /** Absolute path to LoRA .safetensors file */
  loraPath?: string;
  /** LoRA adapter weight (default 1.0) */
  loraWeight?: number;
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
    const translated = await translateToTags(koreanTexts);
    autoTranslatedTags = translated.map(t => t.tag);
  }

  const prompt = buildCharacterPrompt(character, kind, additionalPrompt, autoTranslatedTags);
  const negativePrompt = buildDefaultNegativePrompt(provider.defaultNegativePrompt);

  const width = provider.defaultWidth ?? preset.width;
  const height = provider.defaultHeight ?? preset.height;
  const steps = provider.defaultSteps ?? 20;
  const cfgScale = provider.defaultCfgScale ?? 7;

  const uploadDir = path.join(
    process.cwd(),
    'public',
    'uploads',
    'characters',
    character.id,
    'generated'
  );
  await mkdir(uploadDir, { recursive: true });

  if (provider.providerType === 'diffusers') {
    // Direct diffusers subprocess — images saved directly to disk
    // Use both GPUs for parallel batch splitting when batchSize > 1
    const gpus = getImageGenGpus();
    const result = await generateWithDiffusers({
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      batchSize,
      modelId: provider.modelName || DEFAULT_DIFFUSERS_MODEL,
      outputDir: uploadDir,
      scheduler: mapSamplerToScheduler(provider.defaultSampler),
      gpus,
      loraPath: params.loraPath,
      loraWeight: params.loraWeight,
    }, onProgress);

    return result.images.map((img) => ({
      filePath: `/uploads/characters/${character.id}/generated/${img.filePath}`,
      seed: img.seed,
      width: img.width,
      height: img.height,
      prompt: result.prompt,
      negativePrompt: result.negativePrompt,
    }));
  }

  if (provider.providerType === 'automatic1111') {
    const client = new Automatic1111Client(provider.baseUrl || 'http://localhost:7860');
    const sampler = provider.defaultSampler ?? 'Euler a';

    const result = await client.txt2img({
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      sampler,
      cfgScale,
      batchSize,
    });

    const savedImages: SavedImage[] = [];
    for (const img of result.images) {
      const filename = `${crypto.randomUUID()}.png`;
      const buffer = Buffer.from(img.base64, 'base64');
      await writeFile(path.join(uploadDir, filename), buffer);

      savedImages.push({
        filePath: `/uploads/characters/${character.id}/generated/${filename}`,
        seed: img.seed,
        width: img.width,
        height: img.height,
        prompt: result.prompt,
        negativePrompt: result.negativePrompt,
      });
    }
    return savedImages;
  }

  throw new Error(`지원되지 않는 이미지 생성 제공자: ${provider.providerType}`);
}

/** Map UI sampler names to diffusers scheduler names */
function mapSamplerToScheduler(sampler?: string | null): string {
  if (!sampler) return 'euler_a';
  const normalized = sampler.toLowerCase().replace(/\s+/g, '_');
  if (normalized.includes('euler') && normalized.includes('a')) return 'euler_a';
  if (normalized.includes('euler')) return 'euler';
  if (normalized.includes('dpm')) return 'dpm++_2m';
  return 'euler_a';
}

/** Build a preview prompt without running generation */
export function previewPrompt(
  character: CharacterPromptContext,
  kind: ImageKind,
  additionalPrompt?: string,
  providerNegativePrompt?: string | null,
  autoTranslatedTags?: string[],
): { prompt: string; negativePrompt: string } {
  return {
    prompt: buildCharacterPrompt(character, kind, additionalPrompt, autoTranslatedTags),
    negativePrompt: buildDefaultNegativePrompt(providerNegativePrompt),
  };
}
