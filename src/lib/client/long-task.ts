export async function readLongTask<T>(response: Response, progress: (message: string) => void): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `요청에 실패했습니다 (${response.status}).`);
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return response.json();
  const reader = response.body?.getReader();
  if (!reader) throw new Error('응답을 읽을 수 없습니다.');
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | undefined;
  let completed = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/u);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const lines = block.split(/\r?\n/u);
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        const raw = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (event === 'progress') progress(String(data.message ?? '처리 중...'));
        if (event === 'error') throw new Error(data.message || 'AI 작업에 실패했습니다.');
        if (event === 'done') { result = data; completed = true; }
      }
      if (done) break;
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
  finally { reader.releaseLock(); }
  if (!completed) throw new Error('완료 전에 연결이 끊겼습니다. 다시 시도해주세요.');
  return result as T;
}
