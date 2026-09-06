const FALLBACK_PATH = '/';
const AUTH_PATHS = new Set(['/login', '/setup']);

export function sanitizeReturnTo(value: unknown, fallback = FALLBACK_PATH): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  try {
    const parsed = new URL(value, 'http://muse.local');
    if (parsed.origin !== 'http://muse.local' || AUTH_PATHS.has(parsed.pathname)) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
