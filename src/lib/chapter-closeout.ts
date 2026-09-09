import { z } from 'zod';
import { PLOT_NODE_KINDS } from './plot-board';
import { STORY_STATE_CATEGORIES } from './story-state';
import { STORY_DATE_PRECISIONS } from './story-timeline';

export const closeoutStoryDateSchema = z.object({
  storyYear: z.number().int().min(1).max(1_000_000).nullable(),
  storyMonth: z.number().int().min(1).max(24).nullable(),
  storyDay: z.number().int().min(1).max(100).nullable(),
  storyTimeLabel: z.string().max(80).nullable(),
  storyDatePrecision: z.enum(STORY_DATE_PRECISIONS),
  storyDateLabel: z.string().max(160).nullable(),
  evidence: z.string().min(1).max(1000),
});

export const closeoutStateCandidateSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(STORY_STATE_CATEGORIES),
  subjectType: z.enum(['project', 'character', 'world']),
  subjectName: z.string().max(160),
  characterId: z.string().uuid().nullable(),
  worldEntryId: z.string().uuid().nullable(),
  knowledgeScope: z.enum(['canon', 'reader', 'character']),
  knowerName: z.string().max(160).nullable(),
  knowerCharacterId: z.string().uuid().nullable(),
  certainty: z.enum(['known', 'suspected', 'believed']),
  label: z.string().min(1).max(120),
  previousValue: z.string().max(1000).nullable(),
  value: z.string().min(1).max(1000),
  details: z.string().max(2000).nullable(),
  evidence: z.string().min(1).max(1000),
  warning: z.string().max(300).nullable(),
});

export const closeoutPlotCandidateSchema = z.object({
  id: z.string().uuid(),
  nodeKind: z.enum(PLOT_NODE_KINDS),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).nullable(),
  lane: z.string().max(100).nullable(),
  evidence: z.string().min(1).max(1000),
});

export const chapterCloseoutPlanSchema = z.object({
  summary: z.string().max(600),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  truncated: z.boolean(),
  storyDate: closeoutStoryDateSchema.nullable(),
  states: z.array(closeoutStateCandidateSchema).max(20),
  plotNodes: z.array(closeoutPlotCandidateSchema).max(20),
});
export type ChapterCloseoutPlan = z.infer<typeof chapterCloseoutPlanSchema>;

export const applyChapterCloseoutSchema = chapterCloseoutPlanSchema.pick({
  snapshotHash: true, storyDate: true, states: true, plotNodes: true,
});
