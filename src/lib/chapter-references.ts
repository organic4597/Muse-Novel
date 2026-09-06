import { z } from 'zod';

export const CHAPTER_REFERENCE_GROUPS = ['character', 'location', 'item', 'organization', 'other'] as const;
export const CHAPTER_REFERENCE_PRESENCE = ['appears', 'mentioned'] as const;
export type ChapterReferenceGroup = (typeof CHAPTER_REFERENCE_GROUPS)[number];

export const chapterReferenceInputSchema = z.object({
  characterId: z.string().uuid().nullable().optional(),
  worldEntryId: z.string().uuid().nullable().optional(),
  presence: z.enum(CHAPTER_REFERENCE_PRESENCE).default('appears'),
  displayGroupOverride: z.enum(CHAPTER_REFERENCE_GROUPS).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
}).superRefine((value, context) => {
  if (Boolean(value.characterId) === Boolean(value.worldEntryId)) context.addIssue({ code: 'custom', message: '인물 또는 세계관 항목 중 하나만 연결해야 합니다.' });
  if (value.characterId && value.displayGroupOverride && value.displayGroupOverride !== 'character') context.addIssue({ code: 'custom', message: '인물은 등장인물 그룹에 표시합니다.' });
});

export const chapterReferencesSaveSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  references: z.array(chapterReferenceInputSchema).max(300),
}).superRefine((value, context) => {
  const keys = value.references.map((entry) => entry.characterId ? `character:${entry.characterId}` : `world:${entry.worldEntryId}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: '같은 항목을 한 회차에 중복 연결할 수 없습니다.' });
});
