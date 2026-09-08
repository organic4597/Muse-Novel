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
