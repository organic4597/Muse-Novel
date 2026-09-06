export const SESSION_COOKIE_NAME = 'muse_session';
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export const AUTH_PUBLIC_PATHS = new Set([
  '/login',
  '/setup',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
  '/api/auth/setup',
  '/api/health',
]);
