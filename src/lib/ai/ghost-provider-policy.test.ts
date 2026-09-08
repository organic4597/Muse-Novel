import { describe, expect, it } from 'vitest';
import { GHOST_PROVIDER_TYPES, isGhostProviderType, isLocalGhostBaseUrl } from './ghost-provider-policy';

describe('Ghost provider policy', () => {
  it('allows only local inference provider families', () => {
    expect(GHOST_PROVIDER_TYPES).toEqual(['qwen-local', 'openai-compatible', 'ollama', 'koboldcpp']);
    expect(isGhostProviderType('opencode-oauth')).toBe(false);
    expect(isGhostProviderType('openai')).toBe(false);
  });
  it.each([
    'http://127.0.0.1:8080', 'http://localhost:11434', 'http://192.168.1.18:8080',
    'http://172.19.0.4:8080', 'http://ghost-model:8080', 'http://host.docker.internal:8080',
  ])('accepts local endpoint %s', value => expect(isLocalGhostBaseUrl(value)).toBe(true));
  it.each(['https://api.openai.com/v1', 'https://example.com', 'ftp://127.0.0.1/model'])
    ('rejects public or non-http endpoint %s', value => expect(isLocalGhostBaseUrl(value)).toBe(false));
});
