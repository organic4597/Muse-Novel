import { asc, eq } from 'drizzle-orm';
import type { DB } from '@/lib/db';
import { chapters, plotEdges, plotNodes } from '@/lib/db/schema';
import type { PlotEdgeInput, PlotNodeInput } from '@/lib/plot-board';

export async function listPlotBoard(db: DB, projectId: string) {
  const [nodes, edges, chapterRows] = await Promise.all([
    Promise.resolve(db.select().from(plotNodes).where(eq(plotNodes.projectId, projectId)).orderBy(asc(plotNodes.sortOrder), asc(plotNodes.createdAt)).all()),
    Promise.resolve(db.select().from(plotEdges).where(eq(plotEdges.projectId, projectId)).orderBy(asc(plotEdges.createdAt)).all()),
    Promise.resolve(db.select({ id: chapters.id, order: chapters.order, title: chapters.title }).from(chapters).where(eq(chapters.projectId, projectId)).all()),
  ]);
  const chaptersById = new Map<string, { order: number; title: string }>(
    chapterRows.map(chapter => [chapter.id, { order: chapter.order, title: chapter.title }])
  );
  return { nodes: nodes.map(node => ({ ...node,
    chapterTitle: node.chapterId ? chaptersById.get(node.chapterId)?.title ?? null : null,
    chapterOrder: node.chapterId ? chaptersById.get(node.chapterId)?.order ?? null : null,
  })), edges };
}

export function getPlotNode(db: DB, id: string) {
  return db.select().from(plotNodes).where(eq(plotNodes.id, id)).get();
}

export function createPlotNode(db: DB, projectId: string, input: PlotNodeInput) {
  return db.insert(plotNodes).values({ ...input, projectId }).returning().get();
}

export function updatePlotNode(db: DB, id: string, input: Partial<PlotNodeInput>) {
  return db.update(plotNodes).set({ ...input, updatedAt: new Date() }).where(eq(plotNodes.id, id)).returning().get();
}

export function deletePlotNode(db: DB, id: string) {
  db.delete(plotNodes).where(eq(plotNodes.id, id)).run();
}

export function getPlotEdge(db: DB, id: string) {
  return db.select().from(plotEdges).where(eq(plotEdges.id, id)).get();
}

export function createPlotEdge(db: DB, projectId: string, input: PlotEdgeInput) {
  return db.insert(plotEdges).values({ ...input, projectId }).returning().get();
}

export function deletePlotEdge(db: DB, id: string) {
  db.delete(plotEdges).where(eq(plotEdges.id, id)).run();
}
