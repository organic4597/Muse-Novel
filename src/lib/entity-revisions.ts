import { z } from 'zod';
import { readResearchJson } from '@/lib/web-research/content';

export const ENTITY_KINDS = ['character', 'world'] as const;
export type EntityKind = typeof ENTITY_KINDS[number];
export type EntitySnapshot = Record<string, string | null>;
export const ENTITY_FIELDS: Record<EntityKind, Record<string, string>> = {
  character: { name: '이름', role: '역할', appearance: '외모', personality: '성격', backstory: '배경', arcDescription: '캐릭터 아크', itemsJson: '소지품' },
  world: { title: '제목', category: '카테고리', content: '내용', researchJson: '참고 출처' },
};
const text = z.string().max(60_000).nullable().optional();
const items = z.array(z.object({ name: z.string().min(1).max(300), description: z.string().max(20_000).optional(), status: z.string().max(100).optional() })).max(300);
const schemas = {
  character: z.object({ name: z.string().trim().min(1).max(300).optional(), role: z.string().max(100).nullable().optional(), appearance: text,
    personality: text, backstory: text, arcDescription: text,
    itemsJson: z.string().max(60_000).refine((value) => { try { return items.safeParse(JSON.parse(value)).success; } catch { return false; } }).nullable().optional(),
  }).strict(),
  world: z.object({ title: z.string().trim().min(1).max(300).optional(), category: z.string().trim().min(1).max(50).optional(), content: text,
    researchJson: z.string().max(60_000).refine((value) => Boolean(readResearchJson(value))).nullable().optional(),
  }).strict(),
};

export function parseEntityPatch(kind: EntityKind, value: unknown): EntitySnapshot {
  const result = schemas[kind].safeParse(value);
  if (!result.success) throw new Error('수정안의 필드나 형식이 올바르지 않습니다. 요청을 구체적으로 적어 다시 시도해주세요.');
  return Object.fromEntries(Object.entries(result.data).filter(([, value]) => value !== undefined)) as EntitySnapshot;
}

export function entitySnapshot(kind: EntityKind, row: Record<string, unknown>): EntitySnapshot {
  return Object.fromEntries(Object.keys(ENTITY_FIELDS[kind]).map((key) => [key, typeof row[key] === 'string' ? row[key] : null]));
}

export function entityChanges(before: EntitySnapshot, patch: EntitySnapshot): EntitySnapshot {
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => (before[key] ?? null) !== value));
}

export function displayEntityValue(key: string, value: string | null | undefined) {
  if (!value) return '(비어 있음)';
  if (key === 'researchJson') return readResearchJson(value)?.sources.map((source) => source.title).join('\n') || '(출처 없음)';
  if (key === 'itemsJson') {
    try {
      const parsed = items.safeParse(JSON.parse(value));
      if (parsed.success) return parsed.data.map((item) => `${item.name}${item.status ? ` [${item.status}]` : ''}${item.description ? ` — ${item.description}` : ''}`).join('\n') || '(소지품 없음)';
    } catch { /* Preserve the original display for legacy values. */ }
  }
  return value;
}
