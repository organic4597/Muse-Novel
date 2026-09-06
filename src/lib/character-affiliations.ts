import { z } from 'zod';

export const AFFILIATION_BOUNDARIES = ['initial', 'chapter_start', 'chapter_end'] as const;
export type AffiliationBoundary = (typeof AFFILIATION_BOUNDARIES)[number] | 'unplaced';

export const affiliationMembershipSchema = z.object({
  organizationEntryId: z.string().uuid(),
  position: z.string().trim().max(120).nullable().optional(),
  isPrimary: z.boolean().default(false),
});

export const affiliationEventInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  chapterId: z.string().uuid().nullable(),
  boundary: z.enum(AFFILIATION_BOUNDARIES),
  reason: z.string().trim().max(1000).nullable().optional(),
  memberships: z.array(affiliationMembershipSchema).max(20),
}).superRefine((value, context) => {
  if (value.boundary === 'initial' && value.chapterId) context.addIssue({ code: 'custom', message: '초기 설정에는 회차를 지정하지 않습니다.' });
  if (value.boundary !== 'initial' && !value.chapterId) context.addIssue({ code: 'custom', message: '회차 변화에는 적용 회차가 필요합니다.' });
  const ids = value.memberships.map((membership) => membership.organizationEntryId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: '같은 소속을 중복 선택할 수 없습니다.' });
  const primaryCount = value.memberships.filter((membership) => membership.isPrimary).length;
  if (value.memberships.length > 0 && primaryCount !== 1) context.addIssue({ code: 'custom', message: '소속이 있으면 대표 소속을 하나 선택해야 합니다.' });
});

export type AffiliationMembershipInput = z.infer<typeof affiliationMembershipSchema>;
export type AffiliationEventInput = z.infer<typeof affiliationEventInputSchema>;

