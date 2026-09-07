export type GhostMetricOutcome =
  | 'automatic_shown'
  | 'explicit_shown'
  | 'full_accepted'
  | 'word_accepted'
  | 'dismissed'
  | 'model_busy'
  | 'timeout'
  | 'empty';

export type GhostTextMetrics = {
  counts: Record<GhostMetricOutcome, number>;
  latencySamples: number;
  latencyTotalMs: number;
  updatedAt: string;
  version: 1;
};

const OUTCOMES: GhostMetricOutcome[] = [
  'automatic_shown',
  'explicit_shown',
  'full_accepted',
  'word_accepted',
  'dismissed',
  'model_busy',
  'timeout',
  'empty',
];

function emptyMetrics(): GhostTextMetrics {
  return {
    counts: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<
      GhostMetricOutcome,
      number
    >,
    latencySamples: 0,
    latencyTotalMs: 0,
    updatedAt: new Date(0).toISOString(),
    version: 1,
  };
}

function storageKey(projectId: string) {
  return `muse-ghost-metrics:v1:${projectId}`;
}

export function readGhostTextMetrics(projectId: string): GhostTextMetrics {
  if (typeof window === 'undefined') return emptyMetrics();
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey(projectId)) ?? 'null'
    ) as Partial<GhostTextMetrics> | null;
    const fallback = emptyMetrics();
    if (!parsed || parsed.version !== 1) return fallback;
    return {
      ...fallback,
      ...parsed,
      counts: Object.fromEntries(
        OUTCOMES.map((outcome) => [
          outcome,
          Math.max(0, Number(parsed.counts?.[outcome]) || 0),
        ])
      ) as Record<GhostMetricOutcome, number>,
    };
  } catch {
    return emptyMetrics();
  }
}

export function recordGhostTextMetric(
  projectId: string,
  outcome: GhostMetricOutcome,
  latencyMs?: number
) {
  if (typeof window === 'undefined') return;
  try {
    const metrics = readGhostTextMetrics(projectId);
    metrics.counts[outcome] += 1;
    if (Number.isFinite(latencyMs) && (latencyMs ?? 0) >= 0) {
      metrics.latencySamples += 1;
      metrics.latencyTotalMs += Math.round(latencyMs ?? 0);
    }
    metrics.updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey(projectId), JSON.stringify(metrics));
  } catch {
    // Metrics are optional and must never interrupt writing.
  }
}

export function getGhostTextTuning(projectId: string): {
  debounceMs: number;
} {
  const { counts } = readGhostTextMetrics(projectId);
  const shown = counts.automatic_shown + counts.explicit_shown;
  const accepted = counts.full_accepted + counts.word_accepted;
  if (shown < 10) return { debounceMs: 900 };
  const acceptanceRate = accepted / shown;
  if (acceptanceRate >= 0.45) return { debounceMs: 700 };
  if (acceptanceRate < 0.15) return { debounceMs: 1300 };
  return { debounceMs: 900 };
}
