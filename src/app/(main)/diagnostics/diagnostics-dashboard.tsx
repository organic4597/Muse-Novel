'use client';

import {
  Activity,
  Clock3,
  Cpu,
  Gauge,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { AIRequestSchedulerMetrics } from '@/lib/ai/request-scheduler';
import type { ObservabilitySnapshot } from '@/lib/observability/server-metrics';

export type DiagnosticsPayload = ObservabilitySnapshot & {
  aiQueue: AIRequestSchedulerMetrics;
};

function formatDuration(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}초`;
  return `${Math.round(value)}ms`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export function DiagnosticsDashboard({
  initialData,
}: {
  initialData: DiagnosticsPayload;
}) {
  const [data, setData] = useState(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/diagnostics', { cache: 'no-store' });
      if (!response.ok) throw new Error('Diagnostics request failed');
      setData((await response.json()) as DiagnosticsPayload);
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const routeSummary = useMemo(() => {
    const count = data.routes.reduce((sum, route) => sum + route.count, 0);
    const failures = data.routes.reduce(
      (sum, route) => sum + route.failureCount,
      0
    );
    const weightedDuration = data.routes.reduce(
      (sum, route) => sum + route.averageMs * route.count,
      0
    );
    return {
      averageMs: count > 0 ? weightedDuration / count : 0,
      count,
      failureRate: count > 0 ? (failures / count) * 100 : 0,
    };
  }, [data.routes]);

  return (
    <div className="space-y-7">
      <section className="muse-panel flex flex-col justify-between gap-5 px-6 py-7 sm:flex-row sm:items-end sm:px-8">
        <div>
          <p className="muse-eyebrow flex items-center gap-1.5">
            <Activity className="size-3.5" />
            Runtime diagnostics
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.03em]">
            운영 진단
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            API 응답시간, 브라우저 체감 성능과 로컬 AI 대기열을 집계합니다.
            프롬프트, 원고, API 키와 오류 메시지는 저장하지 않습니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p
            aria-live="polite"
            className="text-xs text-muted-foreground"
            role="status"
          >
            {refreshError
              ? '새로고침 실패'
              : `${formatTime(data.generatedAt)} 기준`}
          </p>
          <Button
            disabled={isRefreshing}
            onClick={() => void refresh()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
            새로고침
          </Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail={`실패율 ${routeSummary.failureRate.toFixed(1)}%`}
          icon={<Clock3 className="size-4" />}
          label="API 평균 응답"
          value={formatDuration(routeSummary.averageMs)}
        />
        <MetricCard
          detail={`동시 실행 ${data.aiQueue.active}/${data.aiQueue.concurrency}`}
          icon={<Gauge className="size-4" />}
          label="AI 대기 요청"
          value={data.aiQueue.queued.toLocaleString('ko-KR')}
        />
        <MetricCard
          detail={`힙 ${data.memory.heapUsedMb.toLocaleString('ko-KR')} MB`}
          icon={<Cpu className="size-4" />}
          label="서버 메모리 RSS"
          value={`${data.memory.rssMb.toLocaleString('ko-KR')} MB`}
        />
        <MetricCard
          detail={`총 ${routeSummary.count.toLocaleString('ko-KR')}개 측정`}
          icon={<TriangleAlert className="size-4" />}
          label="최근 서버 오류"
          value={data.recentErrors.length.toLocaleString('ko-KR')}
        />
      </div>

      <section className="muse-panel overflow-hidden">
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold">API 응답시간</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            server는 Route Handler 실행시간, browser는 실제 네트워크 완료시간입니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">경로</th>
                <th className="px-3 py-3 font-medium">출처</th>
                <th className="px-3 py-3 text-right font-medium">요청</th>
                <th className="px-3 py-3 text-right font-medium">평균</th>
                <th className="px-3 py-3 text-right font-medium">P95</th>
                <th className="px-3 py-3 text-right font-medium">최대</th>
                <th className="px-5 py-3 text-right font-medium">실패</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.routes.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-center text-muted-foreground" colSpan={7}>
                    아직 수집된 API 측정값이 없습니다.
                  </td>
                </tr>
              ) : (
                data.routes.map((route) => (
                  <tr key={`${route.source}:${route.route}`}>
                    <td className="px-5 py-3 font-mono text-xs">{route.route}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {route.source}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{route.count}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatDuration(route.averageMs)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatDuration(route.p95Ms)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatDuration(route.maxMs)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {route.failureCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="muse-panel overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h2 className="font-heading text-lg font-semibold">브라우저 Web Vitals</h2>
          </div>
          <div className="divide-y divide-border/60">
            {data.webVitals.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                페이지를 사용하면 체감 성능 지표가 여기에 표시됩니다.
              </p>
            ) : (
              data.webVitals.map((metric) => (
                <div className="flex items-center justify-between gap-4 px-5 py-3" key={metric.name}>
                  <div>
                    <p className="font-mono text-sm font-semibold">{metric.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {metric.count}회 · poor {metric.poorCount}회
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums">
                    평균 {metric.average.toLocaleString('ko-KR')}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="muse-panel overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h2 className="font-heading text-lg font-semibold">최근 오류</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              내용 없이 경로·상태만 최대 {data.limits.recentErrors}건 보관합니다.
            </p>
          </div>
          <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
            {data.recentErrors.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                기록된 서버 오류가 없습니다.
              </p>
            ) : (
              data.recentErrors.map((error, index) => (
                <div className="flex items-center justify-between gap-4 px-5 py-3" key={`${error.at}:${index}`}>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{error.route}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {error.method} · {error.kind} · {formatTime(error.at)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                    {error.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  detail,
  icon,
  label,
  value,
}: {
  detail: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="muse-panel p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-3 font-heading text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}
