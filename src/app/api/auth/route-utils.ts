import type { NextRequest } from 'next/server';

const MAX_AUTH_BODY_BYTES = 4096;
const AUTH_BODY_TIMEOUT_MS = 3000;

export function requestBodyIsAcceptable(request: NextRequest): boolean {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return false;
  }
  const rawContentLength = request.headers.get('content-length');
  if (rawContentLength === null) {
    return true;
  }
  if (!/^\d+$/u.test(rawContentLength)) {
    return false;
  }
  const contentLength = Number(rawContentLength);
  return Number.isSafeInteger(contentLength) && contentLength <= MAX_AUTH_BODY_BYTES;
}

export async function readAuthBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (!requestBodyIsAcceptable(request) || !request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const deadline = Date.now() + AUTH_BODY_TIMEOUT_MS;
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error('Authentication request body timed out');
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Authentication request body timed out')),
            remainingMs
          );
        }),
      ]).finally(() => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
      if (result.done) {
        break;
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > MAX_AUTH_BODY_BYTES) {
        throw new Error('Authentication request body is too large');
      }
      chunks.push(result.value);
    }

    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, totalBytes)
    );
    const body: unknown = JSON.parse(decoded);
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}
