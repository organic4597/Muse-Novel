import type { CharacterPromptContext, ImageKind } from './types';
import { SHOT_PRESETS } from './types';
import { extractLatinParts } from './tag-translator';

/**
 * Deduplicate tags while preserving order.
 * Normalizes by trimming and lowercasing for comparison.
 */
function deduplicateTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter(tag => {
    const key = tag.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Build a Stable Diffusion prompt from character fields + shot preset + user instructions.
 * CJK (Korean/Chinese/Japanese) text is filtered out since SDXL models can't process it.
 * Korean character fields should be pre-translated to English tags via tag-translator
 * and passed through additionalInstructions or autoTranslatedTags.
 * All tags are deduplicated to prevent repetition artifacts.
 */
export function buildCharacterPrompt(
  character: CharacterPromptContext,
  kind: ImageKind,
  additionalInstructions?: string,
  autoTranslatedTags?: string[],
): string {
  const preset = SHOT_PRESETS[kind];
  const allTags: string[] = [];

  // Shot preset (split into individual tags)
  allTags.push(...preset.promptPrefix.split(',').map(t => t.trim()));

  // Character descriptors — only Latin/English parts (CJK filtered out)
  if (character.appearance) {
    const latin = extractLatinParts(character.appearance);
    if (latin) allTags.push(...latin.split(',').map(t => t.trim()));
  }

  if (character.role) {
    const latin = extractLatinParts(character.role);
    if (latin) allTags.push(...latin.split(',').map(t => t.trim()));
  }

  if (character.personality) {
    const latin = extractLatinParts(character.personality);
    if (latin) {
      const short = latin.length > 80 ? latin.slice(0, 80) : latin;
      allTags.push(...short.split(',').map(t => t.trim()));
    }
  }

  // Auto-translated tags from Korean character fields
  if (autoTranslatedTags?.length) {
    allTags.push(...autoTranslatedTags);
  }

  // User additional instructions (tag recommender + manual tags)
  if (additionalInstructions?.trim()) {
    allTags.push(...additionalInstructions.split(',').map(t => t.trim()));
  }

  // Quality boosters
  allTags.push('masterpiece', 'best quality', 'highly detailed');

  return deduplicateTags(allTags).join(', ');
}

export function buildDefaultNegativePrompt(baseNegative?: string | null): string {
  const defaults = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, deformed, multiple views, character sheet, comic, collage, reference sheet';
  
  if (baseNegative?.trim()) {
    return `${baseNegative.trim()}, ${defaults}`;
  }

  return defaults;
}
