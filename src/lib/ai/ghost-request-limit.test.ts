import { describe, expect, it } from 'vitest';
import { reserveGhostRequest } from './ghost-request-limit';
describe('Ghost inference request limit', () => {
  it('allows at most one start per second, including manual calls, and no overlapping inference', () => {
    const id = crypto.randomUUID();
    const first = reserveGhostRequest(id, 1000);
    expect(first).not.toBeNull();
    expect(reserveGhostRequest(id, 1500)).toBeNull();
    expect(reserveGhostRequest(id, 3000)).toBeNull();
    first?.();
    expect(reserveGhostRequest(id, 1999)).toBeNull();
    const second = reserveGhostRequest(id, 2000);
    expect(second).not.toBeNull(); second?.();
  });
});
