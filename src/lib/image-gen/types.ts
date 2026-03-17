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

export const SHOT_PRESETS: Record<
  ImageKind,
  {
    width: number;
    height: number;
    promptPrefix: string;
    promptDefaults: string[];
    negativePromptDefaults: string[];
  }
> = {
  profile: {
    width: 512,
    height: 512,
    promptPrefix: 'portrait, face close-up, upper body',
    promptDefaults: [
      'portrait focus',
      'clean face framing',
      'clear eye contact',
      'soft portrait lighting',
      'simple readable background',
      'single character',
      'centered composition',
      'natural facial expression',
      'detailed face rendering',
    ],
    negativePromptDefaults: [
      'cropped forehead',
      'cropped chin',
      'extreme close-up',
      'face out of frame',
      'tilted face cut off',
      'distorted facial symmetry',
      'cross-eyed',
      'deformed eyes',
      'deformed mouth',
      'bad teeth',
      'asymmetrical eyes',
      'duplicate face',
    ],
  },
  'full-body': {
    width: 512,
    height: 768,
    promptPrefix: 'full body, standing pose',
    promptDefaults: [
      'full body character focus',
      'head-to-toe framing',
      'balanced pose',
      'clear silhouette',
      'grounded stance',
      'readable outfit details',
      'clean anatomy presentation',
      'simple environmental context',
      'single character',
    ],
    negativePromptDefaults: [
      'body cut off',
      'feet out of frame',
      'cropped legs',
      'cropped hands',
      'extra limbs',
      'disconnected limbs',
      'twisted torso',
      'broken spine',
      'bad posture',
      'unbalanced stance',
      'floating character',
      'duplicate body',
    ],
  },
  illustration: {
    width: 768,
    height: 768,
    promptPrefix: 'illustration, detailed, artistic',
    promptDefaults: [
      'scene-driven illustration',
      'cinematic composition',
      'clear foreground and background separation',
      'cohesive environment design',
      'storytelling atmosphere',
      'intentional lighting mood',
      'depth and perspective',
      'single main subject emphasis',
      'detailed rendering',
    ],
    negativePromptDefaults: [
      'flat composition',
      'empty background',
      'messy perspective',
      'confusing focal point',
      'overcrowded frame',
      'multiple unrelated subjects',
      'background clutter',
      'stiff action',
      'inconsistent lighting',
      'muddy colors',
      'visual noise',
      'unfinished background',
    ],
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
