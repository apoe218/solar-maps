import { describe, expect, it } from 'vitest';
import { daysSinceJ2000 } from '../src/ephemeris';

describe('daysSinceJ2000', () => {
  it('is 0 at the J2000 epoch', () => {
    expect(daysSinceJ2000(new Date('2000-01-01T12:00:00Z'))).toBe(0);
  });

  it('counts whole days', () => {
    expect(daysSinceJ2000(new Date('2000-01-02T12:00:00Z'))).toBe(1);
    expect(daysSinceJ2000(new Date('1999-12-31T12:00:00Z'))).toBe(-1);
  });
});
