import type { CharacterPromptContext, ImageKind } from './types';
import { SHOT_PRESETS } from './types';

/**
 * Build a Stable Diffusion prompt from character fields + shot preset + user instructions.
 */
export function buildCharacterPrompt(
  character: CharacterPromptContext,
  kind: ImageKind,
  additionalInstructions?: string
): string {
  const preset = SHOT_PRESETS[kind];
  const parts: string[] = [];

  // Shot preset
  parts.push(preset.promptPrefix);

  // Character descriptors
  if (character.appearance) {
    parts.push(character.appearance);
  }

  if (character.role) {
    parts.push(character.role);
  }

  if (character.personality) {
    // Extract visual cues from personality (keep it brief)
    const personalityShort = character.personality.length > 80
      ? character.personality.slice(0, 80)
      : character.personality;
    parts.push(personalityShort);
  }

  // User additional instructions
  if (additionalInstructions?.trim()) {
    parts.push(additionalInstructions.trim());
  }

  // Quality boosters
  parts.push('masterpiece, best quality, highly detailed');

  return parts.join(', ');
}

export function buildDefaultNegativePrompt(baseNegative?: string | null): string {
  const defaults = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, deformed';
  
  if (baseNegative?.trim()) {
    return `${baseNegative.trim()}, ${defaults}`;
  }

  return defaults;
}
