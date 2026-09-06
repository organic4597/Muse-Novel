const LATENCY_BUCKETS_MS = [
  50,
  100,
  250,
  500,
  1000,
  2500,
  5000,
  10_000,
  30_000,
  60_000,
] as const;
const MAX_ROUTE_SERIES = 64;
const MAX_WEB_VITAL_SERIES = 16;
const MAX_RECENT_ERRORS = 40;

type MetricSource = 'browser' | 'server';

type MutableAggregate = {
  bucketCounts: number[];
  count: number;
  errorCount: number;
  failureCount: number;
  lastAt: number;
  lastValue: number;
  maxValue: number;
  minValue: number;
  name: string;
  source: MetricSource;
  totalValue: number;
};

type MutableWebVital = {
  count: number;
  lastAt: number;
  lastValue: number;
  maxValue: number;
  name: string;
  poorCount: number;
  totalValue: number;
};

type RecentError = {
  at: number;
  kind: 'http' | 'uncaught';
  method: string;
  route: string;
  source: MetricSource;
  status: number;
};

type ObservabilityStore = {
  recentErrors: RecentError[];
  routes: Map<string, MutableAggregate>;
  startedAt: number;
  webVitals: Map<string, MutableWebVital>;
};

export type RouteMetricSnapshot = {
  averageMs: number;
  count: number;
  errorCount: number;
  failureCount: number;
  lastAt: string;
  lastMs: number;
  maxMs: number;
  minMs: number;
  p95Ms: number;
  route: string;
  source: MetricSource;
};

export type WebVitalSnapshot = {
  average: number;
  count: number;
  lastAt: string;
  lastValue: number;
  maxValue: number;
  name: string;
  poorCount: number;
};

export type ObservabilitySnapshot = {
  generatedAt: string;
  limits: {
    recentErrors: number;
    routeSeries: number;
    webVitalSeries: number;
  };
  memory: {
    arrayBuffersMb: number;
    externalMb: number;
    heapTotalMb: number;
    heapUsedMb: number;
    rssMb: number;
  };
  recentErrors: Array<{
    at: string;
    kind: RecentError['kind'];
    method: string;
    route: string;
    source: MetricSource;
    status: number;
  }>;
  routes: RouteMetricSnapshot[];
  startedAt: string;
  uptimeSeconds: number;
  webVitals: WebVitalSnapshot[];
};

const globalForObservability = globalThis as typeof globalThis & {
  __museObservabilityStore?: ObservabilityStore;
};

function createStore(): ObservabilityStore {
  return {
    recentErrors: [],
    routes: new Map(),
    startedAt: Date.now(),
    webVitals: new Map(),
  };
}

const store =
  globalForObservability.__museObservabilityStore ?? createStore();
globalForObservability.__museObservabilityStore = store;

function finiteMetric(value: number, max = 600_000) {
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, 0), max);
}

function safeMethod(method: string | undefined) {
  const normalized = (method ?? 'UNKNOWN').toUpperCase();
  return /^[A-Z]{2,12}$/.test(normalized) ? normalized : 'UNKNOWN';
}

function dynamicSegment(segment: string, index: number, parts: string[]) {
  if (!segment) return segment;
  if (/^\[[^\]]+\]$/.test(segment)) return segment;
  if (
    /^\d+$/.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ||
    /^(?:project|chapter|character|entry|profile|image|emotion|relationship)-/i.test(
      segment
    )
  ) {
    return '[id]';
  }

  const previous = parts[index - 1];
  if (
    (previous === 'projects' && index > 1) ||
    previous === 'chapters' ||
    previous === 'characters' ||
    previous === 'emotions' ||
    previous === 'images' ||
    previous === 'relationships' ||
    previous === 'style-profiles' ||
    previous === 'world-entries'
  ) {
    const staticChildren = new Set([
      'activate',
      'analyze',
      'appearances',
      'assistant',
      'content',
      'generate',
      'health',
      'image',
      'links',
      'models',
      'reorder',
      'search',
      'suggest',
      'tags',
      'upload',
    ]);
    if (!staticChildren.has(segment)) return '[id]';
  }

  return segment;
}

/**
 * Removes queries and entity identifiers before a route becomes a metric key.
 * This bounds cardinality and prevents user-provided query text from reaching
 * diagnostics memory.
 */
export function normalizeMetricRoute(rawRoute: string) {
  const path = rawRoute.split(/[?#]/, 1)[0] ?? '/unknown';
  const parts = path
    .slice(0, 240)
    .split('/')
    .filter(Boolean);
  const normalized = parts.map((part, index) =>
    dynamicSegment(part, index, parts)
  );
  return `/${normalized.join('/')}`.slice(0, 160) || '/';
}

function getRouteSeries(route: string, source: MetricSource) {
  const safeRoute = normalizeMetricRoute(route);
  const key = `${source}:${safeRoute}`;
  const existing = store.routes.get(key);
  if (existing) return existing;

  const overflowKey = `${source}:/other`;
  if (store.routes.size >= MAX_ROUTE_SERIES - 1) {
    const overflow = store.routes.get(overflowKey);
    if (overflow) return overflow;
    const aggregate = createAggregate('/other', source);
    store.routes.set(overflowKey, aggregate);
    return aggregate;
  }

  const aggregate = createAggregate(safeRoute, source);
  store.routes.set(key, aggregate);
  return aggregate;
}

function createAggregate(name: string, source: MetricSource): MutableAggregate {
  return {
    bucketCounts: LATENCY_BUCKETS_MS.map(() => 0),
    count: 0,
    errorCount: 0,
    failureCount: 0,
    lastAt: 0,
    lastValue: 0,
    maxValue: 0,
    minValue: Number.POSITIVE_INFINITY,
    name,
    source,
    totalValue: 0,
  };
}

function appendRecentError(error: RecentError) {
  store.recentErrors.push(error);
  if (store.recentErrors.length > MAX_RECENT_ERRORS) {
    store.recentErrors.splice(
      0,
      store.recentErrors.length - MAX_RECENT_ERRORS
    );
  }
}

export function recordApiMeasurement({
  durationMs,
  method,
  route,
  source,
  status,
}: {
  durationMs: number;
  method?: string;
  route: string;
  source: MetricSource;
  status: number;
}) {
  const duration = finiteMetric(durationMs);
  if (duration === null) return;
  const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : 0;
  const series = getRouteSeries(route, source);

  series.count += 1;
  series.totalValue += duration;
  series.lastValue = duration;
  series.lastAt = Date.now();
  series.maxValue = Math.max(series.maxValue, duration);
  series.minValue = Math.min(series.minValue, duration);
  if (safeStatus >= 400) series.failureCount += 1;
  if (safeStatus >= 500) series.errorCount += 1;
  for (let index = 0; index < LATENCY_BUCKETS_MS.length; index += 1) {
    if (duration <= LATENCY_BUCKETS_MS[index]) {
      series.bucketCounts[index] += 1;
      break;
    }
  }

  if (safeStatus >= 500) {
    appendRecentError({
      at: Date.now(),
      kind: 'http',
      method: safeMethod(method),
      route: series.name,
      source,
      status: safeStatus,
    });
  }
}

export function recordUncaughtRequestError({
  method,
  route,
}: {
  method?: string;
  route: string;
}) {
  appendRecentError({
    at: Date.now(),
    kind: 'uncaught',
    method: safeMethod(method),
    route: normalizeMetricRoute(route),
    source: 'server',
    status: 500,
  });
}

const WEB_VITAL_NAMES = new Set([
  'CLS',
  'FCP',
  'FID',
  'INP',
  'LCP',
  'TTFB',
  'Next.js-hydration',
  'Next.js-render',
  'Next.js-route-change-to-render',
]);

export function recordWebVital({
  name,
  rating,
  value,
}: {
  name: string;
  rating?: string;
  value: number;
}) {
  const metricValue = finiteMetric(value, 3_600_000);
  if (metricValue === null || !WEB_VITAL_NAMES.has(name)) return;

  let series = store.webVitals.get(name);
  if (!series) {
    if (store.webVitals.size >= MAX_WEB_VITAL_SERIES) return;
    series = {
      count: 0,
      lastAt: 0,
      lastValue: 0,
      maxValue: 0,
      name,
      poorCount: 0,
      totalValue: 0,
    };
    store.webVitals.set(name, series);
  }

  series.count += 1;
  series.totalValue += metricValue;
  series.lastValue = metricValue;
  series.lastAt = Date.now();
  series.maxValue = Math.max(series.maxValue, metricValue);
  if (rating === 'poor') series.poorCount += 1;
}

function estimateP95(series: MutableAggregate) {
  const target = Math.max(1, Math.ceil(series.count * 0.95));
  let cumulative = 0;
  for (let index = 0; index < LATENCY_BUCKETS_MS.length; index += 1) {
    cumulative += series.bucketCounts[index];
    if (cumulative >= target) return LATENCY_BUCKETS_MS[index];
  }
  return series.maxValue;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function bytesToMb(value: number) {
  return round(value / 1024 / 1024);
}

export function getObservabilitySnapshot(): ObservabilitySnapshot {
  const now = Date.now();
  const memory = process.memoryUsage();

  return {
    generatedAt: new Date(now).toISOString(),
    limits: {
      recentErrors: MAX_RECENT_ERRORS,
      routeSeries: MAX_ROUTE_SERIES,
      webVitalSeries: MAX_WEB_VITAL_SERIES,
    },
    memory: {
      arrayBuffersMb: bytesToMb(memory.arrayBuffers),
      externalMb: bytesToMb(memory.external),
      heapTotalMb: bytesToMb(memory.heapTotal),
      heapUsedMb: bytesToMb(memory.heapUsed),
      rssMb: bytesToMb(memory.rss),
    },
    recentErrors: [...store.recentErrors].reverse().map((error) => ({
      ...error,
      at: new Date(error.at).toISOString(),
    })),
    routes: [...store.routes.values()]
      .map((series) => ({
        averageMs: round(series.totalValue / Math.max(1, series.count)),
        count: series.count,
        errorCount: series.errorCount,
        failureCount: series.failureCount,
        lastAt: new Date(series.lastAt).toISOString(),
        lastMs: round(series.lastValue),
        maxMs: round(series.maxValue),
        minMs: round(
          Number.isFinite(series.minValue) ? series.minValue : 0
        ),
        p95Ms: round(estimateP95(series)),
        route: series.name,
        source: series.source,
      }))
      .sort((left, right) => right.count - left.count),
    startedAt: new Date(store.startedAt).toISOString(),
    uptimeSeconds: Math.max(0, Math.round((now - store.startedAt) / 1000)),
    webVitals: [...store.webVitals.values()]
      .map((series) => ({
        average: round(series.totalValue / Math.max(1, series.count)),
        count: series.count,
        lastAt: new Date(series.lastAt).toISOString(),
        lastValue: round(series.lastValue),
        maxValue: round(series.maxValue),
        name: series.name,
        poorCount: series.poorCount,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function resetObservabilityForTests() {
  store.recentErrors.length = 0;
  store.routes.clear();
  store.webVitals.clear();
  store.startedAt = Date.now();
}

export function observeApiHandler<TArgs extends unknown[]>(
  route: string,
  method: string,
  handler: (...args: TArgs) => Promise<Response> | Response
) {
  return async (...args: TArgs) => {
    const startedAt = performance.now();
    try {
      const response = await handler(...args);
      recordApiMeasurement({
        durationMs: performance.now() - startedAt,
        method,
        route,
        source: 'server',
        status: response.status,
      });
      return response;
    } catch (error) {
      recordApiMeasurement({
        durationMs: performance.now() - startedAt,
        method,
        route,
        source: 'server',
        status: 500,
      });
      throw error;
    }
  };
}
