import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  getExternalService,
  setExternalService,
} from '../queries/external-services';
import { createProject } from '../queries/projects';
import * as schema from '../schema';

describe('External service settings', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(() => {
    sqlite.exec('DELETE FROM external_service_settings');
    sqlite.exec('DELETE FROM projects');
  });

  it('stores and updates a global tag API URL', async () => {
    await setExternalService(db, {
      serviceType: 'tag-recommender',
      baseUrl: 'http://127.0.0.1:9877',
    });
    await setExternalService(db, {
      serviceType: 'tag-recommender',
      baseUrl: 'http://127.0.0.1:9999',
    });

    const setting = await getExternalService(db, 'tag-recommender');
    expect(setting?.baseUrl).toBe('http://127.0.0.1:9999');
    expect(
      db.select().from(schema.externalServiceSettings).all()
    ).toHaveLength(1);
  });

  it('keeps project LoRA APIs isolated', async () => {
    const first = await createProject(db, { title: '첫 프로젝트' });
    const second = await createProject(db, { title: '둘째 프로젝트' });

    await setExternalService(db, {
      serviceType: 'lora-training',
      projectId: first.id,
      baseUrl: 'http://127.0.0.1:8331',
    });
    await setExternalService(db, {
      serviceType: 'lora-training',
      projectId: second.id,
      baseUrl: 'http://127.0.0.1:8332',
    });

    expect(
      (await getExternalService(db, 'lora-training', first.id))?.baseUrl
    ).toBe('http://127.0.0.1:8331');
    expect(
      (await getExternalService(db, 'lora-training', second.id))?.baseUrl
    ).toBe('http://127.0.0.1:8332');
  });

  it('lets a project override the global embedding API', async () => {
    const project = await createProject(db, { title: '기억 검색 작품' });
    await setExternalService(db, {
      serviceType: 'embedding',
      baseUrl: 'http://127.0.0.1:8081',
    });
    await setExternalService(db, {
      serviceType: 'embedding',
      projectId: project.id,
      baseUrl: 'http://10.0.0.18:8081',
    });

    expect((await getExternalService(db, 'embedding'))?.baseUrl).toBe(
      'http://127.0.0.1:8081'
    );
    expect(
      (await getExternalService(db, 'embedding', project.id))?.baseUrl
    ).toBe('http://10.0.0.18:8081');
  });
});
