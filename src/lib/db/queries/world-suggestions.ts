import { and, desc, eq, inArray } from 'drizzle-orm';
import type { WorldBatchReport } from '@/lib/ai/world-request';
import type { DB } from '@/lib/db';
import { worldEntries, worldEntrySuggestions, worldEntryTags } from '@/lib/db/schema';
import { selectCitedResearch, splitResearchContent } from '@/lib/web-research/content';
import type { WebResearch } from '@/lib/web-research/types';
import type { WorldSuggestion } from '@/lib/world-suggestions';
import { resolveStoredWorldCategoryName } from './world-categories';

export class WorldSuggestionReviewError extends Error {}
type SuggestionRow = typeof worldEntrySuggestions.$inferSelect;
type WorldEntryRow = typeof worldEntries.$inferSelect;

function asSuggestion(row: typeof worldEntrySuggestions.$inferSelect): WorldSuggestion {
  return {
    id: row.id, projectId: row.projectId, batchId: row.batchId,
    title: row.title, category: row.category, content: row.content,
    tags: JSON.parse(row.tagsJson),
    research: row.researchJson ? JSON.parse(row.researchJson) : undefined,
    sourceIds: row.sourceIdsJson ? JSON.parse(row.sourceIdsJson) : undefined,
    report: row.reportJson ? JSON.parse(row.reportJson) : undefined,
    status: row.status, approvedEntryId: row.approvedEntryId, createdAt: row.createdAt,
  };
}

export async function listPendingWorldSuggestions(db: DB, projectId: string) {
  const rows = await db.select().from(worldEntrySuggestions)
    .where(and(eq(worldEntrySuggestions.projectId, projectId), eq(worldEntrySuggestions.status, 'pending')))
    .orderBy(desc(worldEntrySuggestions.createdAt)).all();
  return rows.map(asSuggestion);
}

export async function saveWorldSuggestions(db: DB, projectId: string, inputs: Array<{
  title: string; category: string; content?: string; tags?: string[]; sourceIds?: string[];
}>, options: { research?: WebResearch; report?: WorldBatchReport } = {}) {
  const { research, report } = options;
  if (!inputs.length) return [];
  const batchId = crypto.randomUUID();
  const rows = await db.insert(worldEntrySuggestions).values(inputs.map((input) => ({
    projectId, batchId, title: input.title, category: resolveStoredWorldCategoryName(db, projectId, input.category),
    content: input.content ?? null,
    tagsJson: JSON.stringify([...new Set(input.tags ?? [])].slice(0, 5)),
    researchJson: research ? JSON.stringify(research) : null,
    sourceIdsJson: input.sourceIds ? JSON.stringify(input.sourceIds) : null,
    reportJson: report ? JSON.stringify(report) : null,
  }))).returning().all();
  return rows.map(asSuggestion);
}

export async function reviewWorldSuggestions(db: DB, projectId: string, ids: string[], action: 'approve' | 'reject') {
  // Same synchronous SQLite transaction contract as the existing world-entry writes.
  return db.transaction((tx: DB) => {
    const rows: SuggestionRow[] = tx.select().from(worldEntrySuggestions)
      .where(and(eq(worldEntrySuggestions.projectId, projectId), inArray(worldEntrySuggestions.id, ids))).all();
    if (rows.length !== new Set(ids).size) throw new WorldSuggestionReviewError('이 작품의 검토 후보를 찾을 수 없습니다.');
    const targetStatus = action === 'approve' ? 'approved' : 'rejected';
    if (rows.some((row) => row.status !== 'pending' && row.status !== targetStatus)) {
      throw new WorldSuggestionReviewError('이미 반대 결정으로 처리된 후보가 있습니다. 새로고침 후 확인해주세요.');
    }
    const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
    const existing: WorldEntryRow[] = tx.select().from(worldEntries).where(eq(worldEntries.projectId, projectId)).all();
    const titles = new Set(existing.map((entry) => normalize(entry.title)));
    const entries: Array<typeof worldEntries.$inferSelect & { tags: Array<{ id: string; tag: string }> }> = [];
    const suggestions: WorldSuggestion[] = [];
    for (const row of rows) {
      let approvedEntryId = row.approvedEntryId;
      if (action === 'approve') {
        let entry = existing.find((item) => item.id === row.approvedEntryId);
        if (row.status === 'approved' && !entry) throw new WorldSuggestionReviewError('승인한 세계관 항목이 삭제되었습니다. 자동으로 다시 만들지 않습니다.');
        if (row.status === 'pending') {
          if (titles.has(normalize(row.title))) throw new WorldSuggestionReviewError(`“${row.title}” 항목이 이미 있습니다. 기존 항목을 확인하고 해당 후보를 거부해주세요.`);
          const inserted = tx.insert(worldEntries).values({
            projectId, title: row.title, category: resolveStoredWorldCategoryName(tx, projectId, row.category),
            content: splitResearchContent(row.content).content || null,
            researchJson: JSON.stringify(selectCitedResearch(
              row.researchJson ? JSON.parse(row.researchJson) : splitResearchContent(row.content).research,
              row.sourceIdsJson ? JSON.parse(row.sourceIdsJson) : undefined
            ) ?? null),
          }).returning().all();
          entry = inserted[0];
          if (!entry) throw new WorldSuggestionReviewError('세계관 항목을 저장하지 못했습니다.');
          approvedEntryId = entry.id;
          titles.add(normalize(row.title));
          for (const tag of JSON.parse(row.tagsJson) as string[]) {
            tx.insert(worldEntryTags).values({ entryId: entry.id, tag }).run();
          }
        }
        if (entry) {
          const tags = tx.select({ id: worldEntryTags.id, tag: worldEntryTags.tag }).from(worldEntryTags)
            .where(eq(worldEntryTags.entryId, entry.id)).all();
          entries.push({ ...entry, tags });
        }
      }
      const updated = row.status === 'pending'
        ? tx.update(worldEntrySuggestions).set({ status: targetStatus, approvedEntryId, reviewedAt: new Date() })
          .where(eq(worldEntrySuggestions.id, row.id)).returning().all()[0]
        : row;
      suggestions.push(asSuggestion(updated));
    }
    return { entries, suggestions };
  }, { behavior: 'immediate' });
}
