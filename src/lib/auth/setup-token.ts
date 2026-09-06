import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function isSetupTokenRequired(): boolean {
  return Boolean(process.env.MUSE_AUTH_SETUP_TOKEN);
}

export function verifySetupToken(presented: unknown): boolean {
  const required = process.env.MUSE_AUTH_SETUP_TOKEN;
  if (!required) {
    return true;
  }
  const candidate = typeof presented === 'string' ? presented : '';
  return timingSafeEqual(digest(candidate), digest(required));
}
