import { beforeEach, describe, expect, it } from 'vitest';

import {
  getObservabilitySnapshot,
  normalizeMetricRoute,
  observeApiHandler,
  recordApiMeasurement,
  recordUncaughtRequestError,
  recordWebVital,
  resetObservabilityForTests,
} from './server-metrics';

describe('bounded server observability', () => {
  beforeEach(() => {
    resetObservabilityForTests();
  });

  it('normalizes entity ids and always strips query text', () => {
    expect(
      normalizeMetricRoute(
        '/api/projects/6f75d20c-5385-4f91-b3a0-3ab98af73d10/chapters/chapter-4?prompt=secret'
      )
    ).toBe('/api/projects/[id]/chapters/[id]');
  });

  it('aggregates latency and status without retaining payloads or messages', () => {
    recordApiMeasurement({
      durationMs: 120,
      method: 'POST',
      route: '/api/projects/project-1/chapters?prompt=do-not-store',
      source: 'browser',
      status: 200,
    });
    recordApiMeasurement({
      durationMs: 800,
      method: 'POST',
      route: '/api/projects/project-2/chapters',
      source: 'browser',
      status: 503,
    });

    const snapshot = getObservabilitySnapshot();
    expect(snapshot.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          averageMs: 460,
          count: 2,
          errorCount: 1,
          route: '/api/projects/[id]/chapters',
        }),
      ])
    );
    expect(JSON.stringify(snapshot)).not.toContain('do-not-store');
    expect(snapshot.recentErrors[0]).toMatchObject({
      method: 'POST',
      route: '/api/projects/[id]/chapters',
      status: 503,
    });
  });

  it('keeps errors and route cardinality bounded', () => {
    for (let index = 0; index < 100; index += 1) {
      recordApiMeasurement({
        durationMs: index,
        route: `/api/custom-${index}`,
        source: 'server',
        status: 500,
      });
      recordUncaughtRequestError({
        method: 'GET',
        route: `/route-${index}?secret=value`,
      });
    }

    const snapshot = getObservabilitySnapshot();
    expect(snapshot.routes.length).toBeLessThanOrEqual(
      snapshot.limits.routeSeries
    );
    expect(snapshot.recentErrors).toHaveLength(snapshot.limits.recentErrors);
    expect(JSON.stringify(snapshot)).not.toContain('secret');
  });

  it('accepts only known Web Vital names', () => {
    recordWebVital({ name: 'LCP', rating: 'poor', value: 3200 });
    recordWebVital({ name: 'user-content', value: 100 });

    expect(getObservabilitySnapshot().webVitals).toEqual([
      expect.objectContaining({ count: 1, name: 'LCP', poorCount: 1 }),
    ]);
  });

  it('measures wrapped Route Handlers and rethrows their failures', async () => {
    const measured = observeApiHandler('/api/example', 'GET', () =>
      Response.json({ ok: true }, { status: 202 })
    );
    const failing = observeApiHandler('/api/failing', 'POST', () => {
      throw new Error('must remain outside diagnostics');
    });

    expect((await measured()).status).toBe(202);
    await expect(failing()).rejects.toThrow('must remain outside diagnostics');

    const snapshot = getObservabilitySnapshot();
    expect(snapshot.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 1, route: '/api/example' }),
        expect.objectContaining({
          count: 1,
          errorCount: 1,
          route: '/api/failing',
        }),
      ])
    );
    expect(JSON.stringify(snapshot)).not.toContain(
      'must remain outside diagnostics'
    );
  });
});
