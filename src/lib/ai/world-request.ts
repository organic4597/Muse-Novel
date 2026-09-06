export type WorldRequestPlan = { countHint?: number };

export type WorldBatchReport = {
  instruction: string;
  requestedCount: number;
  expectedTitles: string[];
  existingTitles: string[];
  pendingTitles: string[];
  generatedCount: number;
  updateTitles?: string[];
  missingTitles: string[];
  note?: string;
  warnings: string[];
  diagnostics: Array<{ stage: string; finishReason?: string; inputTokens?: number; outputTokens?: number; maxOutputTokens: number }>;
};

/** Only explicit quantity syntax is a code-level hint. Domain concepts are interpreted by the model. */
export function planWorldRequest(instruction: string): WorldRequestPlan {
  const compact = instruction.normalize('NFKC').replace(/\s+/g, '');
  const subset = compact.match(/(?:중|가운데)(\d{1,3})(?:개|곳|종|항목)/u);
  const total = compact.match(/(?:총|합계|모두)(\d{1,3})(?:개|곳|종|항목)/u);
  if (subset || total) return { countHint: Number((subset ?? total)![1]) };
  const numeric = [...compact.matchAll(/(\d{1,3})(?:개|곳|종(?!파)|항목)/gu)];
  if (numeric.length) return { countHint: numeric.reduce((sum, match) => sum + Number(match[1]), 0) };
  const korean: [RegExp, number][] = [
    [/(?:스무|이십)개/u, 20], [/열아홉개/u, 19], [/열여덟개/u, 18], [/열일곱개/u, 17],
    [/열여섯개/u, 16], [/(?:열다섯|십오)개/u, 15], [/열네개/u, 14], [/열세개/u, 13],
    [/열두개/u, 12], [/열한개/u, 11], [/(?:열|십)개/u, 10], [/아홉개/u, 9], [/여덟개/u, 8],
    [/일곱개/u, 7], [/여섯개/u, 6], [/다섯개/u, 5], [/네개/u, 4], [/세개/u, 3], [/두개/u, 2], [/한개/u, 1],
  ];
  return { countHint: korean.find(([pattern]) => pattern.test(compact))?.[1] };
}

export function worldTitleKey(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

export type WorldRosterMember = { title: string; group: string };

export function validateWorldRoster(value: unknown, plan: WorldRequestPlan): WorldRosterMember[] {
  const groups = value && typeof value === 'object' ? (value as { groups?: unknown }).groups : null;
  if (!Array.isArray(groups) || !groups.length || groups.length > 20) throw new Error('요청을 해석한 대상 묶음(groups)이 없습니다.');
  const seen = new Set<string>();
  const roster: WorldRosterMember[] = [];
  for (const group of groups) {
    if (!group || typeof group.label !== 'string' || !group.label.trim() || group.label.length > 100 ||
      !Number.isInteger(group.expectedCount) || group.expectedCount < 1 || !Array.isArray(group.members)) {
      throw new Error('대상 묶음의 이름·개수·명단 형식이 잘못되었습니다.');
    }
    if (group.expectedCount > 20 || roster.length + group.expectedCount > 20) throw new Error('요청한 개별 대상이 20개를 넘습니다. 요청 범위를 나눠주세요.');
    if (group.members.length !== group.expectedCount) throw new Error(`${group.label} 명단은 ${group.expectedCount}개여야 하지만 ${group.members.length}개입니다.`);
    for (const member of group.members) {
      const title = typeof member === 'string' ? member : member?.title;
      if (typeof title !== 'string' || !title.trim() || title.length > 100 || /https?:\/\//u.test(title)) throw new Error('명단의 개별 이름이 잘못되었습니다.');
      const key = worldTitleKey(title);
      if (seen.has(key)) throw new Error(`명단에 ${title}이 중복되었습니다.`);
      seen.add(key);
      roster.push({ title: title.trim(), group: group.label.trim() });
    }
  }
  if (plan.countHint !== undefined && roster.length !== plan.countHint) {
    throw new Error(`명시적으로 요청한 ${plan.countHint}개와 명단 ${roster.length}개가 다릅니다.`);
  }
  return roster;
}
