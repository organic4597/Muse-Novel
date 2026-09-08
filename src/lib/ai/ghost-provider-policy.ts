import type { ProviderType } from './types';

export const GHOST_PROVIDER_TYPES = [
  'qwen-local',
  'openai-compatible',
  'ollama',
  'koboldcpp',
] as const satisfies readonly ProviderType[];
export type GhostProviderType = (typeof GHOST_PROVIDER_TYPES)[number];

export function isGhostProviderType(value: string): value is GhostProviderType {
  return (GHOST_PROVIDER_TYPES as readonly string[]).includes(value);
}

/** Ghost Text is a high-frequency path. Only loopback, private/LAN, Docker DNS,
 * and host.docker.internal endpoints are accepted. */
export function isLocalGhostBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === 'host.docker.internal' ||
      host.endsWith('.local') ||
      (!host.includes('.') && !host.includes(':')) ||
      /^127\./u.test(host) ||
      /^10\./u.test(host) ||
      /^192\.168\./u.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./u.test(host) ||
      /^169\.254\./u.test(host) ||
      /^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/iu.test(host)
    ) return true;
    return false;
  } catch { return false; }
}
