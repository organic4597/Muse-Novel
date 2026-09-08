import { z } from 'zod';

export const storylineMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20_000),
  incomplete: z.boolean().optional(),
  references: z.array(z.string().max(300)).max(30).optional(),
});
export type StorylineMessage = z.infer<typeof storylineMessageSchema>;
export type StorylineConversation = { messages: StorylineMessage[]; revision: number };
export const storylineMessagesSchema = z.array(storylineMessageSchema).max(60);
export const storylineRequestSchema = z.object({
  message: z.string().trim().min(1).max(3000),
  revision: z.number().int().nonnegative(),
  chapterId: z.string().uuid().nullable().default(null),
});

export const storylineNoteSummaryRequestSchema = z.object({
  messageId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
});

export const storylineNoteEditSchema = z.object({
  original: z.string().min(1).max(2000),
  replacement: z.string().max(3000),
  reason: z.string().trim().min(1).max(300),
});

export const storylineNoteEditPlanSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  edits: z.array(storylineNoteEditSchema).max(8),
  addition: z.string().max(4000),
  warnings: z.array(z.string().trim().min(1).max(300)).max(6),
});
export type StorylineNoteEditPlan = z.infer<typeof storylineNoteEditPlanSchema>;

export const storylineNoteEditRequestSchema = storylineNoteSummaryRequestSchema;
