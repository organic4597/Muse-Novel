import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DB } from '@/lib/db';
import { createChapter, deleteChapter, updateContent } from '@/lib/db/queries/chapters';
import { createCharacter } from '@/lib/db/queries/characters';
import { setExternalService } from '@/lib/db/queries/external-services';
import { createProject } from '@/lib/db/queries/projects';
import { createStoryStateEntry } from '@/lib/db/queries/story-state';
import * as schema from '@/lib/db/schema';

import {
  chunkMemoryText,
  collectProjectMemorySources,
  cosineSimilarity,
  indexProjectMemory,
  retrieveProjectMemory,
} from './project-memory';

describe('project semantic memory', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: DB;

  beforeEach(() => {
    vi.stubEnv('EMBEDDING_BASE_URL', '');
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    sqlite.close();
  });

  it('embeds all changed sources in global batches and reuses matching fingerprints', async () => {
    const project = await createProject(db, { title: '대규모 작품' });
    await setExternalService(db, {
      baseUrl: 'http://127.0.0.1:8081',
      serviceType: 'embedding',
    });
    for (let index = 0; index < 20; index += 1) {
      await createCharacter(db, {
        name: `인물 ${index}`,
        personality: `성격 ${index}`,
        projectId: project.id,
      });
    }
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { input: string[] };
      return {
        json: async () => ({
          data: body.input.map((_, index) => ({
            embedding: [1, index / 100, 0],
            index,
          })),
          model: '/opt/models/Qwen3-Embedding-0.6B.gguf',
        }),
        ok: true,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await indexProjectMemory(db, project.id);
    expect(first.updatedSources).toBe(21);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    const second = await indexProjectMemory(db, project.id);
    expect(second.updatedSources).toBe(0);
    expect(second.skippedSources).toBe(21);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('excludes vectors with a mismatched fingerprint and diversifies sources', async () => {
    const project = await createProject(db, { title: '지문 검사' });
    await setExternalService(db, {
      baseUrl: 'http://127.0.0.1:8081',
      serviceType: 'embedding',
    });
    db.insert(schema.semanticMemoryChunks)
      .values([
        {
          chunkIndex: 0,
          content: '토끼의 검 상태',
          contentHash: 'a',
          embeddingJson: JSON.stringify([1, 0]),
          embeddingModel: 'old-model:d2',
          projectId: project.id,
          sourceId: 'one',
          sourceTitle: '첫 자료',
          sourceType: 'chapter',
        },
        {
          chunkIndex: 1,
          content: '토끼의 검 상태 반복',
          contentHash: 'b',
          projectId: project.id,
          sourceId: 'one',
          sourceTitle: '첫 자료',
          sourceType: 'chapter',
        },
        {
          chunkIndex: 0,
          content: '토끼의 검 상태와 관계된 다른 설정',
          contentHash: 'c',
          projectId: project.id,
          sourceId: 'two',
          sourceTitle: '둘째 자료',
          sourceType: 'world',
        },
      ])
      .run();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ data: [{ embedding: [1, 0], index: 0 }] }),
        ok: true,
      })
    );

    const result = await retrieveProjectMemory(db, project.id, '토끼의 검 상태', {
      limit: 2,
      perSourceLimit: 1,
    });
    expect(result.mode).toBe('keyword');
    expect(new Set(result.matches.map((match) => match.sourceId))).toEqual(
      new Set(['one', 'two'])
    );
    expect(result.warning).toContain('지문');
  });

  it('chunks on readable boundaries with bounded overlap', () => {
    const input = `${'첫 문단 내용입니다. '.repeat(30)}\n\n${'둘째 문단입니다. '.repeat(30)}`;
    const chunks = chunkMemoryText(input, 300, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 300)).toBe(true);
    expect(chunks.join('')).toContain('첫 문단');
  });

  it('computes safe cosine similarity', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('indexes incrementally and retrieves by keyword without an embedding API', async () => {
    const project = await createProject(db, {
      title: '검은 토끼',
      synopsis: '토끼가 소림의 명예장로가 되는 이야기',
    });
    const chapter = await createChapter(db, { projectId: project.id, title: '돌산' });
    await updateContent(
      db,
      chapter.id,
      JSON.stringify([{ type: 'p', children: [{ text: '토끼는 공청석유를 숨겼다.' }] }])
    );

    const first = await indexProjectMemory(db, project.id);
    expect(first.updatedSources).toBe(2);
    expect(first.embeddingAvailable).toBe(false);

    const second = await indexProjectMemory(db, project.id);
    expect(second.updatedSources).toBe(0);
    expect(second.skippedSources).toBe(2);

    const result = await retrieveProjectMemory(db, project.id, '공청석유');
    expect(result.mode).toBe('keyword');
    expect(result.matches[0]).toMatchObject({ sourceTitle: '돌산' });

    await deleteChapter(db, chapter.id);
    const afterDelete = await indexProjectMemory(db, project.id);
    expect(afterDelete.removedSources).toBeGreaterThan(0);
  });

  it('filters future chapter and state sources before ranking for a scoped writing request', async () => {
    const project = await createProject(db, { title: '시간 범위' });
    const first = await createChapter(db, { projectId: project.id, title: '첫 화', order: 0 });
    const future = await createChapter(db, { projectId: project.id, title: '미래 화', order: 1 });
    await updateContent(db, first.id, JSON.stringify([{ type: 'p', children: [{ text: '현재 단서 청동 열쇠' }] }]));
    await updateContent(db, future.id, JSON.stringify([{ type: 'p', children: [{ text: '미래 비밀 청동 열쇠' }] }]));
    await createStoryStateEntry(db, { projectId: project.id, chapterId: future.id, category: '비밀', label: '범인의 정체', value: '미래에 공개' });
    await indexProjectMemory(db, project.id);
    const result = await retrieveProjectMemory(db, project.id, '청동 열쇠 미래 비밀 범인', { chapterId: first.id, limit: 20 });
    expect(result.matches.some((match) => match.sourceId === first.id)).toBe(true);
    expect(result.matches.some((match) => match.sourceId === future.id)).toBe(false);
    expect(result.matches.some((match) => match.sourceTitle.includes('범인의 정체'))).toBe(false);
  });

  it('indexes active state canon and labels resolved entries as history', async () => {
    const project = await createProject(db, { title: '상태 원장' });
    await createStoryStateEntry(db, {
      category: '소지품',
      isPinned: 1,
      label: '청룡검',
      previousValue: '미소지',
      projectId: project.id,
      value: '주인공이 소지',
    });
    await createStoryStateEntry(db, {
      category: '신체 상태',
      isActive: 0,
      label: '오른팔 부상',
      projectId: project.id,
      value: '회복 완료',
    });

    const sources = await collectProjectMemorySources(db, project.id);
    const stateSources = sources.filter((source) => source.type === 'state');

    expect(stateSources).toHaveLength(2);
    expect(stateSources.find((source) => source.title.includes('청룡검'))?.content)
      .toContain('현재 유효한 정전');
    expect(stateSources.find((source) => source.title.includes('오른팔 부상'))?.content)
      .toContain('현재 상태로 사용 금지');
  });
});
