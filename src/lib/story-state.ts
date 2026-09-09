export const STORY_STATE_CATEGORIES = [
  '위치',
  '신체 상태',
  '감정 상태',
  '소지품',
  '기술',
  '관계',
  '비밀',
  '목표',
  '기타',
] as const;

export type StoryStateCategory = (typeof STORY_STATE_CATEGORIES)[number];

export type StoryStateEntry = {
  category: StoryStateCategory;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterOrder: number | null;
  endChapterId: string | null;
  endChapterTitle: string | null;
  endChapterOrder: number | null;
  characterId: string | null;
  characterName: string | null;
  worldEntryId: string | null;
  worldEntryTitle: string | null;
  knowledgeScope: 'canon' | 'reader' | 'character';
  knowerCharacterId: string | null;
  knowerCharacterName: string | null;
  certainty: 'known' | 'suspected' | 'believed';
  evidence: string | null;
  createdAt: string | Date | null;
  details: string | null;
  id: string;
  isActive: number;
  isPinned: number;
  label: string;
  previousValue: string | null;
  projectId: string;
  updatedAt: string | Date | null;
  value: string;
};

export function isStoryStateEffectiveAt(entry: StoryStateEntry, chapterOrder: number) {
  const started = entry.chapterOrder == null || entry.chapterOrder <= chapterOrder;
  const notEnded = entry.endChapterOrder != null
    ? entry.endChapterOrder > chapterOrder
    : Boolean(entry.isActive);
  return started && notEnded;
}
