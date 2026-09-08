// One shared SSE lifecycle for long-running non-inline tasks. Heartbeats keep
// proxies active; cancellation and timeout reach inference as one signal.
export function longTaskResponse(request: Request, run: (signal: AbortSignal, progress: (message: string) => void) => Promise<unknown>) {
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(600_000)]);
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; abort.abort(); }
      };
      const finish = () => {
        clearInterval(heartbeat);
        signal.removeEventListener('abort', onAbort);
        if (!closed) { closed = true; controller.close(); }
      };
      const onAbort = () => {
        send('error', { message: '요청이 중단되었거나 10분 대기 시간이 지났습니다.' });
        finish();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      heartbeat = setInterval(() => send('heartbeat', {}), 10_000);
      send('progress', { message: '작업을 준비하고 있습니다.' });
      if (signal.aborted) { onAbort(); return; }
      void run(signal, message => send('progress', { message })).then(result => {
        if (!signal.aborted) send('done', result);
      }).catch(error => {
        console.warn('[long-task] failed', { name: error instanceof Error ? error.name : 'Unknown' });
        send('error', { message: 'AI 작업을 완료하지 못했습니다. 원고는 변경되지 않았습니다. 다시 시도해주세요.' });
      }).finally(finish);
    },
    cancel() { closed = true; clearInterval(heartbeat); abort.abort(); },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
