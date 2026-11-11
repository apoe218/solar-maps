import { describe, expect, it } from 'vitest';
import { dateToJulianDate } from '../src/ephemeris';
import { MAX_TICK_SECONDS, SPEEDS, SimClock, formatUtc } from '../src/ui/clock';

const START = new Date('2026-01-01T00:00:00Z');

describe('SimClock', () => {
  it('starts at the given date, playing at 1×', () => {
    const c = new SimClock(START);
    expect(c.jd).toBe(2461041.5);
    expect(c.playing).toBe(true);
    expect(c.speed.id).toBe('realtime');
  });

  it('1× advances in real time', () => {
    const c = new SimClock(START);
    c.tick(0.5);
    expect(c.date.toISOString()).toBe('2026-01-01T00:00:00.500Z');
  });

  it.each([
    ['day', 1],
    ['month', 365.25 / 12],
    ['year', 365.25],
  ])('%s speed advances %f days per second', (id, days) => {
    const c = new SimClock(START);
    c.setSpeed(id);
    c.tick(0.5);
    expect(c.jd - 2461041.5).toBeCloseTo(days / 2, 9);
  });

  it('reverse runs time backwards', () => {
    const c = new SimClock(START);
    c.setSpeed('day');
    c.reverse();
    c.tick(1);
    expect(c.jd).toBeCloseTo(2461040.5, 9);
    c.reverse();
    c.tick(1);
    expect(c.jd).toBeCloseTo(2461041.5, 9);
  });

  it('pause stops time', () => {
    const c = new SimClock(START);
    c.togglePlay();
    c.tick(1);
    expect(c.jd).toBe(2461041.5);
  });

  it('caps a single tick (backgrounded tab) and ignores negative steps', () => {
    const c = new SimClock(START);
    c.setSpeed('year');
    c.tick(600);
    expect(c.jd - 2461041.5).toBeCloseTo(365.25 * MAX_TICK_SECONDS, 9);
    c.tick(-5);
    expect(c.jd - 2461041.5).toBeCloseTo(365.25 * MAX_TICK_SECONDS, 9);
  });

  it('"now" jumps to the wall clock', () => {
    const c = new SimClock(START);
    const now = new Date('2030-05-05T05:05:05Z');
    c.setNow(now);
    expect(c.jd).toBe(dateToJulianDate(now));
  });

  it('flags dates outside 1800–2050', () => {
    expect(new SimClock(new Date('1799-12-31T00:00:00Z')).isAccurate).toBe(false);
    expect(new SimClock(new Date('1800-01-02T00:00:00Z')).isAccurate).toBe(true);
    expect(new SimClock(new Date('2050-12-31T00:00:00Z')).isAccurate).toBe(true);
    expect(new SimClock(new Date('2051-01-02T00:00:00Z')).isAccurate).toBe(false);
  });

  it('rejects unknown speeds; speeds are as specified', () => {
    expect(() => new SimClock(START).setSpeed('warp')).toThrow();
    expect(SPEEDS.map((s) => s.label)).toEqual(['1×', '1 day/s', '1 month/s', '1 yr/s']);
  });
});

describe('formatUtc', () => {
  it('formats as YYYY-MM-DD HH:MM:SS UTC', () => {
    expect(formatUtc(new Date('2026-11-11T22:35:07.900Z'))).toBe('2026-11-11 22:35:07 UTC');
  });
});
