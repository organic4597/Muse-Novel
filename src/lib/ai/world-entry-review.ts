import { z } from 'zod';
import { formatPromptData } from '@/lib/ai/prompt-foundations';
import { WORLD_ENTRY_REVIEW_PROMPT } from '@/lib/ai/world-prompts';
import { worldTitleKey } from '@/lib/ai/world-request';

const reviewSchema = z.object({
  reviews: z.array(z.discriminatedUnion('verdict', [
    z.object({ title: z.string().trim().min(1).max(100), verdict: z.literal('accept') }),
    z.object({
      title: z.string().trim().min(1).max(100), verdict: z.literal('revise'),
      evidence: z.string().trim().min(1).max(2000), reason: z.string().trim().min(1).max(500),
    }),
  ])).min(1).max(4),
});

export type WorldDescription = { title: string; content: string };
export type WorldEntryReview = z.infer<typeof reviewSchema>['reviews'][number];
type ReviewGenerator = (system: string, prompt: string, options: { maxOutputTokens: number; stage: string }) => Promise<unknown>;

// Code validates the review protocol and evidence binding, never prose vocabulary.
export async function reviewWorldEntries(options: {
  entries: WorldDescription[]; instruction: string; context: string;
  generate: ReviewGenerator; signal?: AbortSignal;
}): Promise<Map<string, WorldEntryReview>> {
  const { entries, generate, signal } = options;
  signal?.throwIfAborted();
  if (!entries.length) return new Map();
  if (entries.length > 4) throw new Error('설명 검토는 한 번에 최대 4개입니다.');
  const raw = await generate(WORLD_ENTRY_REVIEW_PROMPT, [
    formatPromptData('author_request', options.instruction),
    formatPromptData('project_context', options.context),
    formatPromptData('candidate_descriptions', JSON.stringify(entries)),
  ].join('\n\n'), { stage: 'review-descriptions', maxOutputTokens: 300 + entries.length * 350 });
  signal?.throwIfAborted();
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success || parsed.data.reviews.length !== entries.length) {
    throw new Error('AI 설명 검토가 완료되지 않았습니다. 후보는 아직 저장되지 않았습니다.');
  }
  const expected = new Map(entries.map((entry) => [worldTitleKey(entry.title), entry]));
  const reviews = new Map<string, WorldEntryReview>();
  for (const review of parsed.data.reviews) {
    const key = worldTitleKey(review.title);
    const entry = expected.get(key);
    if (!entry || reviews.has(key) || (review.verdict === 'revise' && !entry.content.includes(review.evidence))) {
      throw new Error('AI 설명 검토의 대상 또는 근거가 일치하지 않습니다.');
    }
    reviews.set(key, review);
  }
  return reviews;
}
