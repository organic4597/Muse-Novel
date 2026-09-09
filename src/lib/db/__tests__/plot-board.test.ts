import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../schema';
import { createPlotEdge, createPlotNode, deletePlotNode, listPlotBoard } from '../queries/plot-board';

describe('plot causality board', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  beforeEach(() => {
    sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema }); migrate(db, { migrationsFolder: './drizzle' });
    db.insert(schema.projects).values({ id: 'p', title: '무협' }).run();
    db.insert(schema.chapters).values({ id: 'c', projectId: 'p', title: '제 1장', order: 0 }).run();
  });
  afterEach(() => sqlite.close());

  it('stores typed links and removes them with their source node', async () => {
    const base = { chapterId: 'c', status: 'confirmed' as const, description: null, lane: '공청석유', storyYear: 138, storyMonth: 4, storyDay: 12,
      storyTimeLabel: null, storyDatePrecision: 'day' as const, storyDateLabel: null, evidence: null, sortOrder: 0 };
    const rumor = createPlotNode(db, 'p', { ...base, kind: 'foreshadow', title: '공청석유 소문' });
    const search = createPlotNode(db, 'p', { ...base, kind: 'event', title: '바위산 수색', sortOrder: 1 });
    createPlotEdge(db, 'p', { fromNodeId: rumor.id, toNodeId: search.id, type: 'causes' });
    expect((await listPlotBoard(db, 'p')).edges).toHaveLength(1);
    deletePlotNode(db, rumor.id);
    expect((await listPlotBoard(db, 'p')).edges).toHaveLength(0);
  });
});
