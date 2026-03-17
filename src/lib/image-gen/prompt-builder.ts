import { extractLatinParts } from './tag-translator';
import type { CharacterPromptContext, ImageKind } from './types';
import { SHOT_PRESETS } from './types';

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
  allTags.push(...preset.promptDefaults);

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

const GLOBAL_NEGATIVE_DEFAULTS = [
  'lowres',
  'worst quality',
  'low quality',
  'normal quality',
  'jpeg artifacts',
  'blurry',
  'out of focus',
  'text',
  'signature',
  'watermark',
  'username',
  'logo',
  'multiple views',
  'character sheet',
  'reference sheet',
  'comic panel',
  'collage',
  'duplicate character',
  'duplicate face',
  'extra arms',
  'extra hands',
  'extra fingers',
  'missing fingers',
  'fused fingers',
  'bad hands',
  'bad anatomy',
  'deformed body',
  'poorly drawn face',
  'poorly drawn eyes',
  'mutated limbs',
  'disconnected limbs',
];

export function buildDefaultNegativePrompt(
  kind: ImageKind,
  baseNegative?: string | null
): string {
  const defaults = [
    ...GLOBAL_NEGATIVE_DEFAULTS,
    ...SHOT_PRESETS[kind].negativePromptDefaults,
  ].join(', ');

  if (baseNegative?.trim()) {
    return `${baseNegative.trim()}, ${defaults}`;
  }

  return defaults;
}
