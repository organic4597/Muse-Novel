import { aiRequestScheduler } from '@/lib/ai/request-scheduler';
import {
  getObservabilitySnapshot,
  recordApiMeasurement,
  recordWebVital,
} from '@/lib/observability/server-metrics';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 32_768;
const MAX_SAMPLES_PER_REQUEST = 50;

function noStoreHeaders() {
  return {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function GET() {
  return Response.json(
    {
      aiQueue: aiRequestScheduler.getMetrics(),
      ...getObservabilitySnapshot(),
    },
    { headers: noStoreHeaders() }
  );
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json(
      { error: '진단 데이터가 너무 큽니다.' },
      { headers: noStoreHeaders(), status: 413 }
    );
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return Response.json(
      { error: '진단 데이터가 너무 큽니다.' },
      { headers: noStoreHeaders(), status: 413 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json(
      { error: '올바른 JSON이 아닙니다.' },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  if (!isRecord(body) || !Array.isArray(body.samples)) {
    return Response.json(
      { error: 'samples 배열이 필요합니다.' },
      { headers: noStoreHeaders(), status: 400 }
    );
  }
  if (body.samples.length > MAX_SAMPLES_PER_REQUEST) {
    return Response.json(
      { error: `한 번에 최대 ${MAX_SAMPLES_PER_REQUEST}개까지 전송할 수 있습니다.` },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  for (const sample of body.samples) {
    if (!isRecord(sample)) continue;

    if (
      sample.type === 'api' &&
      typeof sample.route === 'string' &&
      typeof sample.durationMs === 'number'
    ) {
      recordApiMeasurement({
        durationMs: sample.durationMs,
        method: 'RESOURCE',
        route: sample.route,
        source: 'browser',
        status: typeof sample.status === 'number' ? sample.status : 0,
      });
      continue;
    }

    if (
      sample.type === 'web-vital' &&
      typeof sample.name === 'string' &&
      typeof sample.value === 'number'
    ) {
      recordWebVital({
        name: sample.name,
        rating: typeof sample.rating === 'string' ? sample.rating : undefined,
        value: sample.value,
      });
    }
  }

  return new Response(null, { headers: noStoreHeaders(), status: 204 });
}
