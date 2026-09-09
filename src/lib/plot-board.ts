import { z } from 'zod';
import { STORY_DATE_PRECISIONS } from './story-timeline';

export const PLOT_NODE_KINDS = ['event', 'choice', 'consequence', 'foreshadow', 'reminder', 'payoff', 'reveal', 'state'] as const;
export const PLOT_EDGE_TYPES = ['causes', 'enables', 'motivates', 'prevents', 'reveals', 'pays_off'] as const;
export const PLOT_NODE_LABELS: Record<(typeof PLOT_NODE_KINDS)[number], string> = {
  event: '사건', choice: '선택', consequence: '결과', foreshadow: '복선 심기', reminder: '복선 재언급', payoff: '복선 회수', reveal: '정보 공개', state: '상태 변화',
};
export const PLOT_EDGE_LABELS: Record<(typeof PLOT_EDGE_TYPES)[number], string> = {
  causes: '원인이 됨', enables: '가능하게 함', motivates: '동기를 제공함', prevents: '방해함', reveals: '공개함', pays_off: '복선을 회수함',
};

export const plotNodeInputSchema = z.object({
  chapterId: z.string().uuid().nullable().default(null),
  kind: z.enum(PLOT_NODE_KINDS),
  status: z.enum(['draft', 'confirmed']).default('draft'),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().default(null),
  lane: z.string().trim().max(100).nullable().default(null),
  storyYear: z.number().int().min(1).max(1_000_000).nullable().default(null),
  storyMonth: z.number().int().min(1).max(24).nullable().default(null),
  storyDay: z.number().int().min(1).max(100).nullable().default(null),
  storyTimeLabel: z.string().trim().max(80).nullable().default(null),
  storyDatePrecision: z.enum(STORY_DATE_PRECISIONS).default('none'),
  storyDateLabel: z.string().trim().max(160).nullable().default(null),
  evidence: z.string().trim().max(2000).nullable().default(null),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
});
export type PlotNodeInput = z.infer<typeof plotNodeInputSchema>;

export const plotEdgeInputSchema = z.object({
  fromNodeId: z.string().uuid(), toNodeId: z.string().uuid(), type: z.enum(PLOT_EDGE_TYPES),
}).refine(value => value.fromNodeId !== value.toNodeId, '같은 노드를 연결할 수 없습니다.');
export type PlotEdgeInput = z.infer<typeof plotEdgeInputSchema>;

export type PlotBoardNode = PlotNodeInput & {
  id: string; projectId: string; chapterTitle: string | null; chapterOrder: number | null;
  createdAt: string | Date; updatedAt: string | Date;
};
export type PlotBoardEdge = PlotEdgeInput & { id: string; projectId: string; createdAt: string | Date };
