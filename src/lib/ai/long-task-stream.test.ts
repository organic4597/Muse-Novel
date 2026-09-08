import { afterEach, describe, expect, it, vi } from 'vitest';
import { longTaskResponse } from './long-task-stream';
import { readLongTask } from '@/lib/client/long-task';
describe('long task SSE lifecycle', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps a pending request alive and forwards progress and completion', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const response = longTaskResponse(new Request('http://localhost'), async (_signal, progress) => {
      progress('장면 분석'); return new Promise(resolve => { finish = resolve; });
    });
    const progress = vi.fn();
    const result = readLongTask(response, progress);
    await vi.advanceTimersByTimeAsync(31000);
    finish({ ok: true });
    expect(await result).toEqual({ ok: true });
    expect(progress).toHaveBeenCalledWith('장면 분석');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels the inference signal when the reader disconnects', async () => {
    let observed: AbortSignal | undefined;
    const response = longTaskResponse(new Request('http://localhost'), signal => {
      observed = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    });
    await response.body?.cancel();
    expect(observed?.aborted).toBe(true);
  });
});
