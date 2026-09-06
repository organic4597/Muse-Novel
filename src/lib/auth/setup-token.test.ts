import { afterEach, describe, expect, it } from 'vitest';

import { isSetupTokenRequired, verifySetupToken } from './setup-token';

afterEach(() => {
  Reflect.deleteProperty(process.env, 'MUSE_AUTH_SETUP_TOKEN');
});

describe('first-run setup token', () => {
  it('is optional when the deployment did not configure one', () => {
    expect(isSetupTokenRequired()).toBe(false);
    expect(verifySetupToken(undefined)).toBe(true);
  });

  it('requires the exact configured value', () => {
    process.env.MUSE_AUTH_SETUP_TOKEN = 'deploy-only-random-code';
    expect(isSetupTokenRequired()).toBe(true);
    expect(verifySetupToken('deploy-only-random-code')).toBe(true);
    expect(verifySetupToken('deploy-only-random-codf')).toBe(false);
    expect(verifySetupToken(undefined)).toBe(false);
  });
});
