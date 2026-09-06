import { describe, expect, it } from 'vitest';

import { getDailySloganDateKey } from './daily-slogan';

describe('getDailySloganDateKey', () => {
  it('uses the Korean calendar day instead of UTC around midnight', () => {
    expect(getDailySloganDateKey(new Date('2026-09-04T15:30:00.000Z'))).toBe(
      '2026-09-05'
    );
  });
});
