export const dynamic = 'force-dynamic';

import { aiRequestScheduler } from '@/lib/ai/request-scheduler';
import { getObservabilitySnapshot } from '@/lib/observability/server-metrics';

import { DiagnosticsDashboard } from './diagnostics-dashboard';

export default function DiagnosticsPage() {
  const initialData = {
    aiQueue: aiRequestScheduler.getMetrics(),
    ...getObservabilitySnapshot(),
  };

  return <DiagnosticsDashboard initialData={initialData} />;
}
