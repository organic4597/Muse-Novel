import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getGhostTextTuning,
  readGhostTextMetrics,
  recordGhostTextMetric,
} from '../ghost-text-metrics';

describe('Ghost Text local metrics', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it('stores only aggregate counters and latency', () => {
    recordGhostTextMetric('project-1', 'automatic_shown', 420);
    recordGhostTextMetric('project-1', 'word_accepted');

    expect(readGhostTextMetrics('project-1')).toEqual(
      expect.objectContaining({
        counts: expect.objectContaining({
          automatic_shown: 1,
          word_accepted: 1,
        }),
        latencySamples: 1,
        latencyTotalMs: 420,
      })
    );
    expect(localStorage.getItem('muse-ghost-metrics:v1:project-1')).not.toContain(
      '원고'
    );
  });

  it('slows low-acceptance projects and speeds up high-acceptance projects', () => {
    for (let index = 0; index < 10; index += 1) {
      recordGhostTextMetric('low', 'automatic_shown');
      recordGhostTextMetric('high', 'automatic_shown');
      if (index < 5) recordGhostTextMetric('high', 'full_accepted');
    }

    expect(getGhostTextTuning('low').debounceMs).toBe(700);
    expect(getGhostTextTuning('high').debounceMs).toBe(250);
  });
});
