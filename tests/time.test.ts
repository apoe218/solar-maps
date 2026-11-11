import { describe, expect, it } from 'vitest';
import { centuriesSinceJ2000, dateToJulianDate, daysSinceJ2000, julianDateToDate } from '../src/ephemeris';

describe('date helpers', () => {
  it('J2000.0 is JD 2451545.0', () => {
    expect(dateToJulianDate(new Date('2000-01-01T12:00:00Z'))).toBe(2451545.0);
  });

  it('Unix epoch is JD 2440587.5', () => {
    expect(dateToJulianDate(new Date(0))).toBe(2440587.5);
  });

  it('2026-01-01T00:00Z is JD 2461041.5 (matches the Horizons fixture epoch)', () => {
    expect(dateToJulianDate(new Date('2026-01-01T00:00:00Z'))).toBe(2461041.5);
  });

  it('round-trips Date → JD → Date to the millisecond', () => {
    for (const iso of ['1800-01-01T00:00:00.000Z', '1969-07-20T20:17:40.000Z', '2050-12-31T23:59:59.999Z']) {
      expect(julianDateToDate(dateToJulianDate(new Date(iso))).toISOString()).toBe(iso);
    }
  });

  it('days and centuries since J2000', () => {
    expect(daysSinceJ2000(2451546.0)).toBe(1);
    expect(daysSinceJ2000(2451544.0)).toBe(-1);
    expect(centuriesSinceJ2000(2451545.0 + 36525)).toBe(1);
    expect(centuriesSinceJ2000(2451545.0 - 36525 / 2)).toBe(-0.5);
  });
});
