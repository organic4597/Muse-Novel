import { describe, expect, it, vi } from 'vitest';

import {
  AIRequestQueueFullError,
  AIRequestScheduler,
  aiRequestScheduler,
  runAIRequest,
  usesLocalAIRequestScheduler,
} from './request-scheduler';
import type { ProviderConfig } from './types';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe('AIRequestScheduler', () => {
  it('runs one request at a time and preserves FIFO within each priority', async () => {
    const scheduler = new AIRequestScheduler({ concurrency: 1 });
    const blocker = deferred<string>();
    const started: string[] = [];

    const first = scheduler.schedule({ priority: 'standard' }, async () => {
      started.push('first');
      return blocker.promise;
    });
    const background = scheduler.schedule({ priority: 'background' }, async () => {
      started.push('background');
      return 'background';
    });
    const standard = scheduler.schedule({ priority: 'standard' }, async () => {
      started.push('standard');
      return 'standard';
    });
    const interactiveOne = scheduler.schedule({ priority: 'interactive' }, async () => {
      started.push('interactive-1');
      return 'interactive-1';
    });
    const interactiveTwo = scheduler.schedule({ priority: 'interactive' }, async () => {
      started.push('interactive-2');
      return 'interactive-2';
    });

    await vi.waitFor(() => expect(started).toEqual(['first']));
    blocker.resolve('first');

    await expect(Promise.all([
      first,
      background,
      standard,
      interactiveOne,
      interactiveTwo,
    ])).resolves.toEqual([
      'first',
      'background',
      'standard',
      'interactive-1',
      'interactive-2',
    ]);
    expect(started).toEqual([
      'first',
      'interactive-1',
      'interactive-2',
      'standard',
      'background',
    ]);
    expect(scheduler.getMetrics()).toMatchObject({
      active: 0,
      queued: 0,
      totals: { completed: 5, failed: 0, started: 5 },
    });
  });

  it('rejects overflow with retry metadata without starting extra work', async () => {
    const scheduler = new AIRequestScheduler({
      concurrency: 1,
      maxQueueSize: 1,
      retryAfterSeconds: 7,
    });
    const blocker = deferred<void>();

    const active = scheduler.schedule({}, () => blocker.promise);
    const queued = scheduler.schedule({}, async () => 'queued');
    const overflow = scheduler.schedule({}, async () => 'overflow');

    await expect(overflow).rejects.toMatchObject({
      code: 'AI_QUEUE_FULL',
      retryAfterSeconds: 7,
    });
    await expect(overflow).rejects.toBeInstanceOf(AIRequestQueueFullError);
    expect(scheduler.getMetrics()).toMatchObject({
      active: 1,
      queued: 1,
      totals: { rejected: 1 },
    });

    blocker.resolve();
    await expect(active).resolves.toBeUndefined();
    await expect(queued).resolves.toBe('queued');
  });

  it('removes a queued request immediately when its signal aborts', async () => {
    const scheduler = new AIRequestScheduler({ concurrency: 1 });
    const blocker = deferred<void>();
    const queuedController = new AbortController();
    const queuedTask = vi.fn(async () => 'should-not-run');

    const active = scheduler.schedule({}, () => blocker.promise);
    const queued = scheduler.schedule(
      { signal: queuedController.signal },
      queuedTask
    );
    queuedController.abort('browser disconnected');

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(queuedTask).not.toHaveBeenCalled();
    expect(scheduler.getMetrics().queued).toBe(0);

    blocker.resolve();
    await active;
    expect(scheduler.getMetrics().totals.cancelled).toBe(1);
  });

  it('cancels running and queued work by project without leaking a slot', async () => {
    const scheduler = new AIRequestScheduler({ concurrency: 1 });
    const started: string[] = [];

    const running = scheduler.schedule(
      { projectId: 'project-a' },
      async (signal) => {
        started.push('running-a');
        if (signal.aborted) throw signal.reason;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );
    const queuedSameProject = scheduler.schedule(
      { projectId: 'project-a' },
      async () => {
        started.push('queued-a');
        return 'queued-a';
      }
    );
    const nextProject = scheduler.schedule(
      { projectId: 'project-b' },
      async () => {
        started.push('project-b');
        return 'project-b';
      }
    );

    await vi.waitFor(() => expect(started).toEqual(['running-a']));
    expect(scheduler.cancelProject('project-a', 'project closed')).toBe(2);

    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await expect(queuedSameProject).rejects.toMatchObject({ name: 'AbortError' });
    await expect(nextProject).resolves.toBe('project-b');
    expect(started).toEqual(['running-a', 'project-b']);
    expect(scheduler.getMetrics()).toMatchObject({
      active: 0,
      queued: 0,
      totals: { cancelled: 2, completed: 1 },
    });
  });

  it('cancels matching request IDs and leaves unrelated work intact', async () => {
    const scheduler = new AIRequestScheduler({ concurrency: 1 });
    const blocker = deferred<void>();
    const active = scheduler.schedule({}, () => blocker.promise);
    const cancelled = scheduler.schedule(
      { requestId: 'request-1' },
      async () => 'cancelled'
    );
    const preserved = scheduler.schedule(
      { requestId: 'request-2' },
      async () => 'preserved'
    );

    expect(scheduler.cancelRequest('request-1')).toBe(1);
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    blocker.resolve();
    await active;
    await expect(preserved).resolves.toBe('preserved');
  });

  it('releases the slot after a task failure and records useful metrics', async () => {
    const scheduler = new AIRequestScheduler({ concurrency: 1 });
    const failed = scheduler.schedule({}, async () => {
      throw new Error('model failed');
    });
    const recovered = scheduler.schedule({}, async () => 'ok');

    await expect(failed).rejects.toThrow('model failed');
    await expect(recovered).resolves.toBe('ok');
    expect(scheduler.getMetrics()).toMatchObject({
      active: 0,
      averageWaitMs: expect.any(Number),
      queued: 0,
      totals: {
        completed: 1,
        failed: 1,
        started: 2,
      },
    });
  });

  it('reports a queued callback only when a request must wait', async () => {
    const scheduler = new AIRequestScheduler({ concurrency: 1 });
    const blocker = deferred<void>();
    const firstQueued = vi.fn();
    const secondQueued = vi.fn();

    const active = scheduler.schedule(
      { onQueued: firstQueued },
      () => blocker.promise
    );
    const queued = scheduler.schedule(
      { onQueued: secondQueued },
      async () => 'done'
    );

    expect(firstQueued).not.toHaveBeenCalled();
    expect(secondQueued).toHaveBeenCalledWith(1);
    blocker.resolve();
    await active;
    await queued;
  });
});

describe('runAIRequest', () => {
  it('uses the backend scheduler for local and generic inference APIs', () => {
    expect(usesLocalAIRequestScheduler({ modelId: 'any-model', provider: 'openai-compatible' })).toBe(true);
    expect(usesLocalAIRequestScheduler({
      modelId: 'local',
      provider: 'qwen-local',
    })).toBe(true);
    expect(usesLocalAIRequestScheduler({
      modelId: 'cloud',
      provider: 'openai',
    })).toBe(false);
  });

  it('does not make a cloud request wait behind a busy local model', async () => {
    const localConfig: ProviderConfig = {
      modelId: 'local',
      provider: 'qwen-local',
    };
    const cloudConfig: ProviderConfig = {
      modelId: 'cloud',
      provider: 'openai',
    };
    const localController = new AbortController();
    const local = runAIRequest(
      localConfig,
      { signal: localController.signal },
      async (signal) => {
        if (signal.aborted) throw signal.reason;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      }
    );

    await vi.waitFor(() => expect(aiRequestScheduler.getMetrics().active).toBe(1));
    await expect(
      runAIRequest(cloudConfig, {}, async () => 'cloud-finished')
    ).resolves.toBe('cloud-finished');

    localController.abort();
    await expect(local).rejects.toMatchObject({ name: 'AbortError' });
  });
});
