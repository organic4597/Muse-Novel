import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearLoginFailures,
  getLoginThrottle,
  getLoginThrottleSizeForTests,
  recordLoginFailure,
  resetLoginThrottleForTests,
} from './throttle';

describe('login throttling', () => {
  beforeEach(() => resetLoginThrottleForTests());

  it('temporarily blocks after five failures and increases the delay', () => {
    const now = 10_000;
    for (let index = 0; index < 5; index += 1) {
      recordLoginFailure('client', now + index);
    }
    expect(getLoginThrottle('client', now + 5)).toEqual({
      blocked: true,
      retryAfterSeconds: 30,
    });
    expect(getLoginThrottle('another-client', now + 5).blocked).toBe(false);
  });

  it('clears failures after a successful login', () => {
    recordLoginFailure('client', 10_000);
    clearLoginFailures('client');
    expect(getLoginThrottle('client', 10_001).blocked).toBe(false);
  });

  it('caps tracked clients and sweeps entries after the window', () => {
    for (let index = 0; index < 2100; index += 1) {
      recordLoginFailure(`client-${index}`, 10_000 + index);
    }
    expect(getLoginThrottleSizeForTests()).toBeLessThanOrEqual(2048);

    getLoginThrottle('new-client', 20 * 60 * 1000);
    expect(getLoginThrottleSizeForTests()).toBe(0);
  });
});
