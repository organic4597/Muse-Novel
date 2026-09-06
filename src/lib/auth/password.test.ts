import { describe, expect, it } from 'vitest';

import { hashPassword, validatePassword, verifyPassword } from './password';
import type { ScryptParameters } from './types';

const FAST_TEST_PARAMETERS: ScryptParameters = {
  N: 2 ** 10,
  r: 8,
  p: 1,
  keyLength: 32,
  maxmem: 8 * 1024 * 1024,
};

describe('password protection', () => {
  it('uses a fresh random salt and verifies only the original password', async () => {
    const first = await hashPassword('a-safe-test-password', FAST_TEST_PARAMETERS);
    const second = await hashPassword('a-safe-test-password', FAST_TEST_PARAMETERS);

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    expect(JSON.stringify(first)).not.toContain('a-safe-test-password');
    await expect(verifyPassword('a-safe-test-password', first)).resolves.toBe(true);
    await expect(verifyPassword('a-wrong-test-password', first)).resolves.toBe(false);
  });

  it('rejects malformed or unsafe stored parameters without deriving a key', async () => {
    const digest = await hashPassword('a-safe-test-password', FAST_TEST_PARAMETERS);
    digest.parameters.N = 1000;
    await expect(verifyPassword('a-safe-test-password', digest)).resolves.toBe(false);
  });

  it('requires twelve characters and caps oversized input', () => {
    expect(validatePassword('short')).toContain('12');
    expect(validatePassword('열두글자비밀번호입니다안전')).toBeNull();
    expect(validatePassword('a'.repeat(1025))).toContain('너무');
  });
});
