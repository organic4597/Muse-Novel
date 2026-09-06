type Attempt = {
  failures: number[];
  lockedUntil: number;
  lastSeen: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const FAILURE_LIMIT = 5;
const MAX_LOCK_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 2048;
const SWEEP_INTERVAL_MS = 60 * 1000;
const attempts = new Map<string, Attempt>();
let lastSweepAt = 0;

function pruneFailures(failures: number[], now: number): number[] {
  return failures.filter((timestamp) => now - timestamp < WINDOW_MS);
}

function sweepAttempts(now: number, force = false): void {
  if (!(force || now - lastSweepAt >= SWEEP_INTERVAL_MS || attempts.size >= MAX_TRACKED_CLIENTS)) {
    return;
  }
  lastSweepAt = now;
  for (const [key, attempt] of attempts) {
    if (now - attempt.lastSeen >= WINDOW_MS && attempt.lockedUntil <= now) {
      attempts.delete(key);
    }
  }
  while (attempts.size > MAX_TRACKED_CLIENTS) {
    const oldestKey = attempts.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    attempts.delete(oldestKey);
  }
}

export function getLoginThrottle(key: string, now = Date.now()): {
  blocked: boolean;
  retryAfterSeconds: number;
} {
  sweepAttempts(now);
  const attempt = attempts.get(key);
  if (!attempt) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  attempt.failures = pruneFailures(attempt.failures, now);
  attempt.lastSeen = now;
  if (attempt.failures.length === 0 && attempt.lockedUntil <= now) {
    attempts.delete(key);
    return { blocked: false, retryAfterSeconds: 0 };
  }
  if (attempt.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((attempt.lockedUntil - now) / 1000)),
    };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  sweepAttempts(now);
  const existing = attempts.get(key) ?? { failures: [], lockedUntil: 0, lastSeen: now };
  existing.failures = [...pruneFailures(existing.failures, now), now].slice(-32);
  existing.lastSeen = now;
  if (existing.failures.length >= FAILURE_LIMIT) {
    const exponent = existing.failures.length - FAILURE_LIMIT;
    existing.lockedUntil = now + Math.min(MAX_LOCK_MS, 30_000 * 2 ** exponent);
  }
  attempts.delete(key);
  attempts.set(key, existing);
  sweepAttempts(now, true);
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

export function resetLoginThrottleForTests(): void {
  attempts.clear();
  lastSweepAt = 0;
}

export function getLoginThrottleSizeForTests(): number {
  return attempts.size;
}
