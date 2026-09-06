import { afterEach, describe, expect, it, vi } from 'vitest';

import { replaceSemanticMemorySources } from './semantic-memory';

function query(run: () => unknown) {
  return {
    values: () => ({ run }),
    where: () => ({ run }),
  };
}

describe('semantic memory driver-safe writes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('awaits async libSQL transaction writes in delete-then-insert order', async () => {
    vi.stubEnv('DATABASE_PROVIDER', 'turso');
    const events: string[] = [];
    const tx = {
      delete: () =>
        query(async () => {
          events.push('delete-start');
          await new Promise((resolve) => setTimeout(resolve, 5));
          events.push('delete-end');
        }),
      insert: () =>
        query(async () => {
          events.push('insert-start');
          await new Promise((resolve) => setTimeout(resolve, 5));
          events.push('insert-end');
        }),
    };
    const db = {
      transaction: async (callback: (value: unknown) => Promise<void>) =>
        callback(tx),
    };
    await replaceSemanticMemorySources(db as never, [
      {
        chunks: [
          {
            chunkIndex: 0,
            content: '기억',
            contentHash: 'hash',
            projectId: 'project',
            sourceId: 'source',
            sourceTitle: '소스',
            sourceType: 'chapter',
          },
        ],
        projectId: 'project',
        sourceId: 'source',
        sourceType: 'chapter',
      },
    ]);
    expect(events).toEqual([
      'delete-start',
      'delete-end',
      'insert-start',
      'insert-end',
    ]);
  });
});

