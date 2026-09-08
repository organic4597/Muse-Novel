import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteGhostAISettings,
  getGhostAISettings,
  setGhostAISettings,
} from '../queries/ghost-ai-settings';
import { createProject } from '../queries/projects';
import * as schema from '../schema';

describe('Ghost AI settings queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(async () => {
    sqlite.exec('DELETE FROM ghost_ai_settings');
    sqlite.exec('DELETE FROM projects');
    projectId = (await createProject(db, { title: 'Ghost 설정 테스트' })).id;
  });

  it('creates and updates one override per project', async () => {
    await setGhostAISettings(db, projectId, {
      providerType: 'qwen-local',
      modelName: 'Kanana-Ghost',
      baseUrl: 'http://127.0.0.1:8080',
      contextSize: 32768,
    });

    await setGhostAISettings(db, projectId, {
      providerType: 'openai-compatible',
      modelName: 'fast-ghost-v2',
      baseUrl: 'http://ghost-api:8080/v1',
      contextSize: 16_384,
    });

    const saved = await getGhostAISettings(db, projectId);
    expect(saved).toEqual(
      expect.objectContaining({
        providerType: 'openai-compatible',
        modelName: 'fast-ghost-v2',
        baseUrl: 'http://ghost-api:8080/v1',
        contextSize: 16_384,
      })
    );
    expect(
      sqlite.prepare('SELECT COUNT(*) AS count FROM ghost_ai_settings').get()
    ).toEqual({ count: 1 });
  });

  it('removes a dedicated connection to disable Ghost Text', async () => {
    await setGhostAISettings(db, projectId, {
      providerType: 'qwen-local',
      modelName: 'Kanana-Ghost',
    });

    await deleteGhostAISettings(db, projectId);

    expect(await getGhostAISettings(db, projectId)).toBeUndefined();
  });

  it('deletes the override when its project is deleted', async () => {
    await setGhostAISettings(db, projectId, {
      providerType: 'qwen-local',
      modelName: 'Kanana-Ghost',
    });

    sqlite.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    expect(await getGhostAISettings(db, projectId)).toBeUndefined();
  });
});
