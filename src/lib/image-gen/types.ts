export type ImageProviderType = 'diffusers' | 'automatic1111';

export type ImageKind = 'profile' | 'full-body' | 'illustration';

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  sampler: string;
  cfgScale: number;
  batchSize: number;
  seed?: number;
  modelName?: string;
}

export interface GeneratedImage {
  /** base64 for A1111, empty for diffusers (files saved directly) */
  base64: string;
  seed: number;
  width: number;
  height: number;
  /** Set by diffusers provider — relative web path of saved file */
  filePath?: string;
}

export interface ImageGenerationResult {
  images: GeneratedImage[];
  prompt: string;
  negativePrompt: string;
}

/** Default diffusers model */
export const DEFAULT_DIFFUSERS_MODEL = 'OnomaAIResearch/Illustrious-XL-v1.1';

/** Available scheduler names for diffusers */
export const DIFFUSERS_SCHEDULERS = ['euler_a', 'euler', 'dpm++_2m'] as const;
export type DiffusersScheduler = (typeof DIFFUSERS_SCHEDULERS)[number];

export interface CharacterPromptContext {
  name: string;
  role?: string | null;
  appearance?: string | null;
  personality?: string | null;
  backstory?: string | null;
}

/** Preset dimensions per shot type */
export const SHOT_PRESETS: Record<ImageKind, { width: number; height: number; promptPrefix: string }> = {
  profile: {
    width: 512,
    height: 512,
    promptPrefix: 'portrait, face close-up, upper body',
  },
  'full-body': {
    width: 512,
    height: 768,
    promptPrefix: 'full body, standing pose',
  },
  illustration: {
    width: 768,
    height: 768,
    promptPrefix: 'illustration, detailed, artistic',
  },
};

export const DEFAULT_BATCH_SIZE: Record<ImageKind, number> = {
  profile: 4,
  'full-body': 2,
  illustration: 2,
};

/** LoRA entry from the registry */
export interface LoraEntry {
  id: string;
  name: string;
  filename: string;
  format: 'lora' | 'lokr';
  civitaiModelId: number;
  civitaiVersionId: number;
  civitaiUrl: string;
  baseModel: string;
  type: 'style' | 'character' | 'clothing';
  triggerWords: string[];
  recommendedWeight: number;
  clipSkip: number;
  description: string;
  tags: string[];
}
