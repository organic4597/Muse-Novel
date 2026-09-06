import { recommendTags } from '@/lib/tag-recommender-client';
import { deduplicateTagObjects } from './tag-normalizer';

export interface TranslatedTag {
  tag: string;
  category: string;
  score: number;
}

/**
 * Check if text contains CJK (Korean/Chinese/Japanese) characters.
 */
export function containsCJK(text: string): boolean {
  return /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(text);
}

/**
 * Extract only Latin/ASCII parts from comma-separated text,
 * filtering out segments that contain CJK characters.
 */
export function extractLatinParts(text: string): string {
  return text
    .split(',')
    .map(p => p.trim())
    .filter(p => p && !containsCJK(p))
    .join(', ');
}

/**
 * Translate Korean character fields into English Danbooru tags
 * using the tag recommender server (Korean→English translation + embedding similarity).
 */
export async function translateToTags(
  texts: Record<string, string>,
  topK: number = 20,
  threshold: number = 0.30,
  baseUrl?: string,
): Promise<TranslatedTag[]> {
  try {
    const tags = await recommendTags(
      texts,
      { topK, threshold, translate: true },
      baseUrl
    );
    return deduplicateTagObjects(
      tags.map(t => ({
        tag: t.tag,
        category: t.category,
        score: t.score,
      }))
    );
  } catch {
    return [];
  }
}

/**
 * Build translation input from character fields that contain Korean text.
 * Returns null if no Korean text is found (no translation needed).
 */
export function buildKoreanCharacterTexts(character: {
  appearance?: string | null;
  personality?: string | null;
  role?: string | null;
}): Record<string, string> | null {
  const texts: Record<string, string> = {};

  if (character.appearance && containsCJK(character.appearance)) {
    texts['외모'] = character.appearance;
  }
  if (character.role && containsCJK(character.role)) {
    texts['역할'] = character.role;
  }
  if (character.personality && containsCJK(character.personality)) {
    texts['성격'] = character.personality;
  }

  return Object.keys(texts).length > 0 ? texts : null;
}
