import { and, eq } from 'drizzle-orm';
import type { DB } from '@/lib/db';
import { chapterCloseouts, chapters, plotNodes, storyStateEntries } from '@/lib/db/schema';
import type { ChapterCloseoutPlan } from '@/lib/chapter-closeout';

type AppliedCloseout = Pick<ChapterCloseoutPlan, 'snapshotHash' | 'storyDate' | 'states' | 'plotNodes'>;

export function applyChapterCloseout(db: DB, projectId: string, chapterId: string, input: AppliedCloseout) {
  return db.transaction(tx => {
    const existing = tx.select({ id: chapterCloseouts.id }).from(chapterCloseouts)
      .where(and(eq(chapterCloseouts.chapterId, chapterId), eq(chapterCloseouts.snapshotHash, input.snapshotHash))).get();
    if (existing) throw new Error('CLOSEOUT_ALREADY_APPLIED');
    const currentStates = tx.select().from(storyStateEntries)
      .where(eq(storyStateEntries.projectId, projectId)).all();
    const stateIds: string[] = [];
    for (const candidate of input.states) {
      const previous = currentStates.find(row => row.isActive && row.category === candidate.category && row.label === candidate.label &&
        row.characterId === candidate.characterId && row.worldEntryId === candidate.worldEntryId && row.knowledgeScope === candidate.knowledgeScope &&
        row.knowerCharacterId === candidate.knowerCharacterId);
      if (previous) tx.update(storyStateEntries).set({ isActive: 0, endChapterId: chapterId, updatedAt: new Date() }).where(eq(storyStateEntries.id, previous.id)).run();
      const id = crypto.randomUUID(); stateIds.push(id);
      tx.insert(storyStateEntries).values({
        id, projectId, chapterId, category: candidate.category, label: candidate.label, value: candidate.value,
        previousValue: candidate.previousValue ?? previous?.value ?? null, details: candidate.details,
        characterId: candidate.characterId, worldEntryId: candidate.worldEntryId, knowledgeScope: candidate.knowledgeScope,
        knowerCharacterId: candidate.knowerCharacterId, certainty: candidate.certainty, evidence: candidate.evidence,
        isActive: 1, isPinned: 0,
      }).run();
    }
    const plotNodeIds: string[] = [];
    for (const [index, candidate] of input.plotNodes.entries()) {
      const id = crypto.randomUUID(); plotNodeIds.push(id);
      tx.insert(plotNodes).values({ id, projectId, chapterId, kind: candidate.nodeKind, status: 'confirmed', title: candidate.title,
        description: candidate.description, lane: candidate.lane, evidence: candidate.evidence, sortOrder: index,
        storyYear: input.storyDate?.storyYear ?? null, storyMonth: input.storyDate?.storyMonth ?? null,
        storyDay: input.storyDate?.storyDay ?? null, storyTimeLabel: input.storyDate?.storyTimeLabel ?? null,
        storyDatePrecision: input.storyDate?.storyDatePrecision ?? 'none', storyDateLabel: input.storyDate?.storyDateLabel ?? null,
      }).run();
    }
    if (input.storyDate) tx.update(chapters).set({
      storyYear: input.storyDate.storyYear, storyMonth: input.storyDate.storyMonth, storyDay: input.storyDate.storyDay,
      storyTimeLabel: input.storyDate.storyTimeLabel, storyDatePrecision: input.storyDate.storyDatePrecision,
      storyDateLabel: input.storyDate.storyDateLabel, updatedAt: new Date(),
    }).where(eq(chapters.id, chapterId)).run();
    const applied = { stateIds, plotNodeIds, storyDateApplied: Boolean(input.storyDate) };
    tx.insert(chapterCloseouts).values({ projectId, chapterId, snapshotHash: input.snapshotHash, appliedJson: JSON.stringify(applied) }).run();
    return applied;
  }, { behavior: 'immediate' });
}
