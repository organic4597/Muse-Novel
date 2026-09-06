import type { Instrumentation } from 'next';

export function register() {
  // The in-process metrics store is initialized lazily in the Node.js runtime.
}

export const onRequestError: Instrumentation.onRequestError = async (
  _error,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordUncaughtRequestError } = await import(
    '@/lib/observability/server-metrics'
  );
  recordUncaughtRequestError({
    method: request.method,
    route: context.routePath,
  });
};
