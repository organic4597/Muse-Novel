import type { RecommendedTag } from '@/lib/tag-recommender-client';

type TagLike = {
  tag: string;
};

export function normalizeTagKey(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function deduplicateTagStrings(tags: string[]): string[] {
  const seen = new Set<string>();

  return tags.filter((tag) => {
    const normalizedTag = normalizeTag(tag);
    const key = normalizeTagKey(normalizedTag);

    if (!normalizedTag || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function deduplicateTagObjects<T extends TagLike>(tags: T[]): T[] {
  const seen = new Set<string>();

  return tags.filter((tagInfo) => {
    const key = normalizeTagKey(tagInfo.tag);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function deduplicateRecommendedTags(tags: RecommendedTag[]): RecommendedTag[] {
  return deduplicateTagObjects(tags);
}
