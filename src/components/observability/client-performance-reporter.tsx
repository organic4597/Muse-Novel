'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { useEffect } from 'react';

type ApiTimingSample = {
  durationMs: number;
  route: string;
  status: number;
  type: 'api';
};

type WebVitalSample = {
  name: string;
  rating: string;
  type: 'web-vital';
  value: number;
};

type PerformanceSample = ApiTimingSample | WebVitalSample;

const DIAGNOSTICS_ENDPOINT = '/api/diagnostics';
const MAX_BUFFERED_SAMPLES = 50;
const FLUSH_INTERVAL_MS = 10_000;
const sampleBuffer: PerformanceSample[] = [];
let flushTimer: number | undefined;

function normalizeBrowserRoute(rawUrl: string) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    const normalized = parts.map((part, index) => {
      const previous = parts[index - 1];
      if (
        /^\d+$/.test(part) ||
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ||
        /^(?:project|chapter|character|entry|profile|image|emotion|relationship)-/i.test(
          part
        )
      ) {
        return '[id]';
      }
      if (
        previous === 'projects' ||
        previous === 'chapters' ||
        previous === 'characters' ||
        previous === 'emotions' ||
        previous === 'images' ||
        previous === 'relationships' ||
        previous === 'style-profiles' ||
        previous === 'world-entries'
      ) {
        const knownStaticSegments = new Set([
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
        if (!knownStaticSegments.has(part)) return '[id]';
      }
      return part;
    });
    return `/${normalized.join('/')}`.slice(0, 160);
  } catch {
    return '/unknown';
  }
}

function sendSamples(samples: PerformanceSample[]) {
  if (samples.length === 0) return;
  const body = JSON.stringify({ samples });

  if (navigator.sendBeacon) {
    const payload = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(DIAGNOSTICS_ENDPOINT, payload)) return;
  }

  void fetch(DIAGNOSTICS_ENDPOINT, {
    body,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => {
    // Diagnostics must never interrupt writing or navigation.
  });
}

function flushSamples() {
  if (flushTimer !== undefined) {
    window.clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  sendSamples(sampleBuffer.splice(0, MAX_BUFFERED_SAMPLES));
}

function queueSample(sample: PerformanceSample) {
  sampleBuffer.push(sample);
  if (sampleBuffer.length > MAX_BUFFERED_SAMPLES) sampleBuffer.shift();
  if (sampleBuffer.length >= 20) {
    flushSamples();
    return;
  }
  if (flushTimer === undefined) {
    flushTimer = window.setTimeout(flushSamples, FLUSH_INTERVAL_MS);
  }
}

const reportWebVital: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  queueSample({
    name: metric.name,
    rating: metric.rating,
    type: 'web-vital',
    value: metric.value,
  });
};

export function ClientPerformanceReporter() {
  useReportWebVitals(reportWebVital);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    const observer = new PerformanceObserver((list) => {
      for (const rawEntry of list.getEntries()) {
        if (rawEntry.entryType !== 'resource') continue;
        const entry = rawEntry as PerformanceResourceTiming & {
          responseStatus?: number;
        };
        let url: URL;
        try {
          url = new URL(entry.name);
        } catch {
          continue;
        }
        if (
          url.origin !== window.location.origin ||
          !url.pathname.startsWith('/api/') ||
          url.pathname === DIAGNOSTICS_ENDPOINT
        ) {
          continue;
        }

        queueSample({
          durationMs: entry.duration,
          route: normalizeBrowserRoute(url.href),
          status: entry.responseStatus ?? 0,
          type: 'api',
        });
      }
    });

    try {
      observer.observe({ buffered: true, type: 'resource' });
    } catch {
      observer.observe({ entryTypes: ['resource'] });
    }

    const handlePageHide = () => flushSamples();
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      observer.disconnect();
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  return null;
}
