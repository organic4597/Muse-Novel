import { beforeEach, describe, expect, it } from 'vitest';

import { resetObservabilityForTests } from '@/lib/observability/server-metrics';

import { GET, POST } from './route';

describe('/api/diagnostics', () => {
  beforeEach(() => {
    resetObservabilityForTests();
  });

  it('accepts bounded anonymous aggregates and exposes queue metrics', async () => {
    const response = await POST(
      new Request('http://localhost/api/diagnostics', {
        body: JSON.stringify({
          samples: [
            {
              durationMs: 321,
              route: '/api/projects/project-1?prompt=never-retain-this',
              status: 200,
              type: 'api',
            },
            {
              name: 'LCP',
              rating: 'good',
              type: 'web-vital',
              value: 1200,
            },
          ],
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(204);
    const snapshotResponse = GET();
    const snapshot = await snapshotResponse.json();
    expect(snapshot.aiQueue).toEqual(expect.objectContaining({ concurrency: 1 }));
    expect(snapshot.routes[0]).toEqual(
      expect.objectContaining({
        count: 1,
        route: '/api/projects/[id]',
        source: 'browser',
      })
    );
    expect(snapshot.webVitals[0]).toEqual(
      expect.objectContaining({ count: 1, name: 'LCP' })
    );
    expect(JSON.stringify(snapshot)).not.toContain('never-retain-this');
    expect(snapshotResponse.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects invalid JSON and oversized batches', async () => {
    const invalid = await POST(
      new Request('http://localhost/api/diagnostics', {
        body: '{',
        method: 'POST',
      })
    );
    expect(invalid.status).toBe(400);

    const oversized = await POST(
      new Request('http://localhost/api/diagnostics', {
        body: JSON.stringify({
          samples: Array.from({ length: 51 }, () => ({})),
        }),
        method: 'POST',
      })
    );
    expect(oversized.status).toBe(400);
  });
});
