import type { ProviderConfig } from './types';

export const AI_REQUEST_PRIORITY_ORDER = [
  'interactive',
  'standard',
  'background',
] as const;

export type AIRequestPriority = (typeof AI_REQUEST_PRIORITY_ORDER)[number];

export type AIRequestSchedulerMetrics = {
  active: number;
  averageWaitMs: number;
  concurrency: number;
  maxQueueSize: number;
  maxWaitMs: number;
  queued: number;
  queuedByPriority: Record<AIRequestPriority, number>;
  totals: {
    cancelled: number;
    completed: number;
    enqueued: number;
    failed: number;
    rejected: number;
    started: number;
  };
};

export type AIRequestSchedulerOptions = {
  concurrency?: number;
  maxQueueSize?: number;
  retryAfterSeconds?: number;
};

export type ScheduleAIRequestOptions = {
  onQueued?: (position: number) => void;
  priority?: AIRequestPriority;
  projectId?: string;
  requestId?: string;
  signal?: AbortSignal;
};

type QueueItem<T> = {
  abortController: AbortController;
  abortListener?: () => void;
  enqueuedAt: number;
  options: ScheduleAIRequestOptions;
  reject: (reason: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
  run: (signal: AbortSignal) => Promise<T>;
  state: 'queued' | 'running' | 'settled';
};

type MutableMetrics = AIRequestSchedulerMetrics['totals'] & {
  maxWaitMs: number;
  totalWaitMs: number;
};

const DEFAULT_MAX_QUEUE_SIZE = 24;
const DEFAULT_RETRY_AFTER_SECONDS = 15;

function positiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value || value < 1) return fallback;
  return Math.trunc(value);
}

function abortError(reason?: unknown): DOMException {
  if (reason instanceof DOMException && reason.name === 'AbortError') return reason;
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === 'string' && reason
      ? reason
      : 'AI request was cancelled.';
  return new DOMException(message, 'AbortError');
}

function isAbortFailure(error: unknown, signal: AbortSignal) {
  return signal.aborted || (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/**
 * Raised before a request starts when the bounded local-model queue is full.
 */
export class AIRequestQueueFullError extends Error {
  readonly code = 'AI_QUEUE_FULL';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('로컬 AI 요청이 너무 많이 대기 중입니다. 잠시 후 다시 시도해주세요.');
    this.name = 'AIRequestQueueFullError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAIRequestQueueFullError(
  error: unknown
): error is AIRequestQueueFullError {
  return error instanceof AIRequestQueueFullError || (
    error instanceof Error &&
    'code' in error &&
    error.code === 'AI_QUEUE_FULL'
  );
}

/**
 * Priority/FIFO scheduler for a model server with limited parallel slots.
 * Running work is never pre-empted; the highest-priority oldest queued item is
 * selected whenever a slot becomes available.
 */
export class AIRequestScheduler {
  readonly concurrency: number;
  readonly maxQueueSize: number;
  readonly retryAfterSeconds: number;

  private readonly activeItems = new Set<QueueItem<unknown>>();
  private readonly metrics: MutableMetrics = {
    cancelled: 0,
    completed: 0,
    enqueued: 0,
    failed: 0,
    maxWaitMs: 0,
    rejected: 0,
    started: 0,
    totalWaitMs: 0,
  };
  private readonly queues: Record<AIRequestPriority, QueueItem<unknown>[]> = {
    background: [],
    interactive: [],
    standard: [],
  };

  constructor(options: AIRequestSchedulerOptions = {}) {
    this.concurrency = positiveInteger(options.concurrency, 1);
    this.maxQueueSize = positiveInteger(
      options.maxQueueSize,
      DEFAULT_MAX_QUEUE_SIZE
    );
    this.retryAfterSeconds = positiveInteger(
      options.retryAfterSeconds,
      DEFAULT_RETRY_AFTER_SECONDS
    );
  }

  schedule<T>(
    options: ScheduleAIRequestOptions,
    run: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    if (options.signal?.aborted) {
      this.metrics.cancelled += 1;
      return Promise.reject(abortError(options.signal.reason));
    }

    if (this.getQueuedCount() >= this.maxQueueSize) {
      this.metrics.rejected += 1;
      return Promise.reject(
        new AIRequestQueueFullError(this.retryAfterSeconds)
      );
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        abortController: new AbortController(),
        enqueuedAt: Date.now(),
        options,
        reject,
        resolve,
        run,
        state: 'queued',
      };

      if (options.signal) {
        item.abortListener = () => {
          this.cancelItem(item, options.signal?.reason);
        };
        options.signal.addEventListener('abort', item.abortListener, {
          once: true,
        });
      }

      const priority = options.priority ?? 'standard';
      this.queues[priority].push(item as QueueItem<unknown>);
      this.metrics.enqueued += 1;

      const willWait =
        this.activeItems.size >= this.concurrency || this.getQueuedCount() > 1;
      if (willWait && options.onQueued) {
        try {
          options.onQueued(this.getQueuedCount());
        } catch {
          // Observability callbacks must never affect request execution.
        }
      }

      this.drain();
    });
  }

  cancelProject(projectId: string, reason?: unknown): number {
    return this.cancelMatching(
      (item) => item.options.projectId === projectId,
      reason
    );
  }

  cancelRequest(requestId: string, reason?: unknown): number {
    return this.cancelMatching(
      (item) => item.options.requestId === requestId,
      reason
    );
  }

  getMetrics(): AIRequestSchedulerMetrics {
    const started = this.metrics.started;
    const queuedByPriority = Object.fromEntries(
      AI_REQUEST_PRIORITY_ORDER.map((priority) => [
        priority,
        this.queues[priority].length,
      ])
    ) as Record<AIRequestPriority, number>;

    return {
      active: this.activeItems.size,
      averageWaitMs: started > 0
        ? Math.round(this.metrics.totalWaitMs / started)
        : 0,
      concurrency: this.concurrency,
      maxQueueSize: this.maxQueueSize,
      maxWaitMs: this.metrics.maxWaitMs,
      queued: this.getQueuedCount(),
      queuedByPriority,
      totals: {
        cancelled: this.metrics.cancelled,
        completed: this.metrics.completed,
        enqueued: this.metrics.enqueued,
        failed: this.metrics.failed,
        rejected: this.metrics.rejected,
        started: this.metrics.started,
      },
    };
  }

  private cancelItem<T>(item: QueueItem<T>, reason?: unknown) {
    if (item.state === 'settled' || item.abortController.signal.aborted) {
      return false;
    }

    const error = abortError(reason);
    item.abortController.abort(error);

    if (item.state === 'running') {
      return true;
    }

    for (const priority of AI_REQUEST_PRIORITY_ORDER) {
      const queue = this.queues[priority];
      const index = queue.indexOf(item as QueueItem<unknown>);
      if (index !== -1) {
        queue.splice(index, 1);
        break;
      }
    }

    item.state = 'settled';
    this.removeAbortListener(item);
    this.metrics.cancelled += 1;
    item.reject(error);
    this.drain();
    return true;
  }

  private cancelMatching(
    predicate: (item: QueueItem<unknown>) => boolean,
    reason?: unknown
  ) {
    const matches = [
      ...this.activeItems,
      ...AI_REQUEST_PRIORITY_ORDER.flatMap(
        (priority) => this.queues[priority]
      ),
    ].filter(predicate);

    let cancelled = 0;
    for (const item of matches) {
      if (this.cancelItem(item, reason)) cancelled += 1;
    }
    return cancelled;
  }

  private drain() {
    while (this.activeItems.size < this.concurrency) {
      const item = this.takeNext();
      if (!item) return;
      this.start(item);
    }
  }

  private getQueuedCount() {
    return AI_REQUEST_PRIORITY_ORDER.reduce(
      (count, priority) => count + this.queues[priority].length,
      0
    );
  }

  private removeAbortListener(item: QueueItem<unknown>) {
    if (item.abortListener && item.options.signal) {
      item.options.signal.removeEventListener('abort', item.abortListener);
    }
  }

  private start(item: QueueItem<unknown>) {
    item.state = 'running';
    this.activeItems.add(item);

    const waitMs = Math.max(0, Date.now() - item.enqueuedAt);
    this.metrics.maxWaitMs = Math.max(this.metrics.maxWaitMs, waitMs);
    this.metrics.totalWaitMs += waitMs;
    this.metrics.started += 1;

    const signal = item.options.signal
      ? AbortSignal.any([item.options.signal, item.abortController.signal])
      : item.abortController.signal;

    Promise.resolve()
      .then(() => item.run(signal))
      .then((value) => {
        if (signal.aborted) {
          this.metrics.cancelled += 1;
          item.reject(abortError(signal.reason));
          return;
        }
        this.metrics.completed += 1;
        item.resolve(value);
      })
      .catch((error: unknown) => {
        if (isAbortFailure(error, signal)) {
          this.metrics.cancelled += 1;
        } else {
          this.metrics.failed += 1;
        }
        item.reject(error);
      })
      .finally(() => {
        item.state = 'settled';
        this.removeAbortListener(item);
        this.activeItems.delete(item);
        this.drain();
      });
  }

  private takeNext() {
    for (const priority of AI_REQUEST_PRIORITY_ORDER) {
      const item = this.queues[priority].shift();
      if (item) return item;
    }
    return undefined;
  }
}

function readPositiveInteger(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return positiveInteger(value, fallback);
}

const globalForScheduler = globalThis as typeof globalThis & {
  __museAIRequestScheduler?: AIRequestScheduler;
};

export const aiRequestScheduler =
  globalForScheduler.__museAIRequestScheduler ??
  new AIRequestScheduler({
    concurrency: readPositiveInteger('AI_LOCAL_CONCURRENCY', 1),
    maxQueueSize: readPositiveInteger(
      'AI_LOCAL_MAX_QUEUE_SIZE',
      DEFAULT_MAX_QUEUE_SIZE
    ),
    retryAfterSeconds: readPositiveInteger(
      'AI_LOCAL_RETRY_AFTER_SECONDS',
      DEFAULT_RETRY_AFTER_SECONDS
    ),
  });

globalForScheduler.__museAIRequestScheduler = aiRequestScheduler;

export function usesLocalAIRequestScheduler(config: ProviderConfig) {
  return config.provider === 'qwen-local' || config.provider === 'openai-compatible';
}

/**
 * Cloud providers bypass the local single-slot queue. The task still receives
 * its caller signal so cancellation behavior is identical on both paths.
 */
export function runAIRequest<T>(
  config: ProviderConfig,
  options: ScheduleAIRequestOptions,
  run: (signal: AbortSignal) => Promise<T>
) {
  if (usesLocalAIRequestScheduler(config)) {
    return aiRequestScheduler.schedule(options, run);
  }

  if (options.signal?.aborted) {
    return Promise.reject(abortError(options.signal.reason));
  }

  return run(options.signal ?? new AbortController().signal);
}
