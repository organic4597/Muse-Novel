import { z } from 'zod';

export const scenePlanSchema = z.object({
  viewpoint: z.string().max(800).default(''), location: z.string().max(800).default(''),
  goal: z.string().max(1200).default(''), obstacle: z.string().max(1200).default(''),
  participants: z.string().max(3000).default(''),
  dialoguePurpose: z.string().max(1200).default(''),
  beats: z.string().max(4000).default(''), outcome: z.string().max(1200).default(''),
  turningPoint: z.string().max(1200).default(''),
  reveal: z.string().max(1200).default(''), conceal: z.string().max(1200).default(''),
  preserve: z.string().max(1600).default(''),
  openQuestions: z.string().max(1600).default(''),
});
export type ScenePlan = z.infer<typeof scenePlanSchema>;
export const EMPTY_SCENE: ScenePlan = scenePlanSchema.parse({});
export const SCENE_LABELS: Record<keyof ScenePlan, string> = {
  viewpoint: '시점 인물', location: '장소', goal: '인물의 목표', obstacle: '방해·갈등',
  participants: '참여자별 목표·정보·전술 (한 줄에 한 명)', dialoguePurpose: '대화가 바꾸어야 할 것',
  beats: '사건 순서 (한 줄에 하나씩)', outcome: '장면 끝에서 달라지는 상황',
  turningPoint: '전환점·결정', reveal: '공개할 정보', conceal: '아직 숨길 정보',
  preserve: '반드시 유지할 사실·말투', openQuestions: '작가 확인이 필요한 결정',
};
export type SceneRecord = { id: string; chapterId: string; title: string; status: 'draft' | 'confirmed'; planJson: string; revision: number };
export type WritingExample = { id: string; kind: 'style' | 'edit'; verdict: 'accepted' | 'rejected'; title: string; original: string; replacement: string; reason: string };
export const exampleSchema = z.object({
  kind: z.enum(['style', 'edit']), verdict: z.enum(['accepted', 'rejected']),
  title: z.string().trim().min(1).max(160), original: z.string().max(6000).default(''),
  replacement: z.string().max(6000), reason: z.string().max(1600).default(''),
});
export const editGoalSchema = z.object({
  original: z.string().min(3).max(1200),
  action: z.enum(['keep', 'compress', 'clarify', 'reorder', 'supplement']),
  issue: z.string().max(600), objective: z.string().min(1).max(800),
});
export type EditGoal = z.infer<typeof editGoalSchema>;
export type EditDiagnosis = { summary: string; goals: EditGoal[]; snapshot: string; reviewedChars: number; truncated: boolean };
export const EDIT_LABELS: Record<EditGoal['action'], string> = { keep: '유지', compress: '압축', clarify: '명료화', reorder: '재배열', supplement: '보충' };

export function parseScenePlan(value: unknown): ScenePlan {
  return scenePlanSchema.parse(value);
}

export function formatScenePlan(plan: ScenePlan) {
  return (Object.keys(SCENE_LABELS) as (keyof ScenePlan)[])
    .filter((key) => plan[key].trim())
    .map((key) => `${SCENE_LABELS[key]}: ${plan[key].trim()}`)
    .join('\n');
}

export function sceneContext(scene: SceneRecord | undefined, compact = false) {
  if (!scene || scene.status !== 'confirmed') return '';
  const plan = parseScenePlan(JSON.parse(scene.planJson));
  const keys: (keyof ScenePlan)[] = compact
    ? ['viewpoint', 'goal', 'participants', 'conceal', 'preserve']
    : (Object.keys(SCENE_LABELS) as (keyof ScenePlan)[]);
  return [`장면 계획(미래 계획이며 이미 일어난 사실이 아님): ${scene.title}`,
    ...keys.filter(key => plan[key]).map(key => `${SCENE_LABELS[key]}: ${plan[key].slice(0, compact ? 130 : 1800)}`),
  ].join('\n');
}

export function relevantExamples(examples: WritingExample[], query: string, budget = 2200) {
  const words = new Set(query.match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  const ranked = examples.map((example, index) => ({ example, index,
    score: [...words].filter(word => `${example.title} ${example.reason} ${example.original}`.includes(word)).length,
  })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3);
  let remaining = budget;
  return ranked.flatMap(({ example }) => {
    const label = example.verdict === 'rejected' ? '작가가 거절한 수정 (모방 금지)' : example.kind === 'style' ? '작가가 선택한 문체 견본' : '작가가 승인한 편집 사례';
    const text = `${label}: ${example.title}\n${example.original ? `원문: ${example.original}\n` : ''}결과: ${example.replacement}\n이유: ${example.reason}`;
    if (text.length > remaining) return [];
    remaining -= text.length;
    return [text];
  }).join('\n\n');
}
