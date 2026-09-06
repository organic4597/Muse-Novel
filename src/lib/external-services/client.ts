export const EXTERNAL_SERVICE_TIMEOUT_MS = 10_000;

export function normalizeExternalServiceUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('HTTP 또는 HTTPS URL만 사용할 수 있습니다.');
  }
  return url.toString().replace(/\/$/, '');
}

export async function testExternalService(
  baseUrl: string,
  healthPath: '/health' | '/v1/models' = '/health',
  options: { bearerToken?: string } = {}
): Promise<{ ok: boolean; message: string }> {
  try {
    const normalized = normalizeExternalServiceUrl(baseUrl);
    const response = await fetch(`${normalized}${healthPath}`, {
      cache: 'no-store',
      headers: options.bearerToken
        ? { Authorization: `Bearer ${options.bearerToken}` }
        : undefined,
      signal: AbortSignal.timeout(EXTERNAL_SERVICE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, message: `API 응답 오류: HTTP ${response.status}` };
    }

    return { ok: true, message: 'API 연결 성공' };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : 'API에 연결할 수 없습니다.',
    };
  }
}
