import { describe, expect, it } from 'vitest';
import { BODIES } from '../src/data/bodies';
import {
  angleBetweenDeg,
  bodyFixedLonLat,
  dateToJulianDate,
  heliocentricPosition,
  iauEquatorFrame,
  orbitNormal,
  orbitalPeriodDays,
  primeMeridianDeg,
  scale,
  solarDayDays,
  sub,
} from '../src/ephemeris';

const at = (iso: string) => dateToJulianDate(new Date(iso));
const body = (id: string) => BODIES.find((b) => b.id === id)!;
const ECLIPTIC_NORTH = { x: 0, y: 0, z: 1 };

describe('IAU rotation data agrees with the NASA fact sheets', () => {
  it.each(BODIES.map((b) => [b.id, b] as const))('%s: obliquity from pole + rotation sense', (_id, b) => {
    const { pole } = iauEquatorFrame(b.rotation.poleRaDeg, b.rotation.poleDecDeg);
    const normal = b.orbit ? orbitNormal(b.orbit, 2451545) : ECLIPTIC_NORTH; // Sun: vs the ecliptic
    const angle = angleBetweenDeg(pole, normal);
    // IAU "north" may be the anti-spin pole (Venus, Uranus); then W decreases.
    const obliquity = b.rotation.wDotDegPerDay > 0 ? angle : 180 - angle;
    expect(obliquity).toBeCloseTo(b.physical.axialTiltDeg, 0); // within 0.5°
    expect(Math.abs(obliquity - b.physical.axialTiltDeg)).toBeLessThan(0.15);
  });

  it.each(BODIES.map((b) => [b.id, b] as const))('%s: rotation period', (_id, b) => {
    const periodHours = (360 / Math.abs(b.rotation.wDotDegPerDay)) * 24;
    expect(periodHours / Math.abs(b.physical.siderealRotationHours)).toBeCloseTo(1, 3);
    // Fact sheets mark retrograde rotators (obliquity > 90°) with a negative period.
    expect(b.physical.siderealRotationHours < 0).toBe(b.physical.axialTiltDeg > 90);
  });
});

describe('primeMeridianDeg', () => {
  it('wraps into [0, 360)', () => {
    expect(primeMeridianDeg(350, 20, 2451545 + 1)).toBeCloseTo(10, 10);
    expect(primeMeridianDeg(10, -20, 2451545 + 1)).toBeCloseTo(350, 10);
  });
});

describe('Earth day/night (sub-solar point)', () => {
  const earth = body('earth');
  const subSolar = (iso: string) => {
    const jd = at(iso);
    return bodyFixedLonLat(scale(heliocentricPosition(BODIES, 'earth', jd), -1), earth.rotation, jd);
  };

  it('is near longitude 0° at 12:00 UTC (equation of time < 17 min ≈ 4.1°)', () => {
    for (const iso of ['2024-03-20T12:00:00Z', '2024-06-20T12:00:00Z', '2024-09-22T12:00:00Z', '2024-12-21T12:00:00Z']) {
      expect(Math.abs(subSolar(iso).lonDeg), iso).toBeLessThan(4.5);
    }
  });

  it('is near 180° at 00:00 UTC and 90°W at 18:00 UTC', () => {
    expect(Math.abs(subSolar('2024-03-20T00:00:00Z').lonDeg)).toBeGreaterThan(175);
    expect(subSolar('2024-03-20T18:00:00Z').lonDeg).toBeCloseTo(-90, -1);
  });

  it('follows the seasons in latitude', () => {
    expect(subSolar('2024-03-20T12:00:00Z').latDeg).toBeCloseTo(0, 0);
    expect(subSolar('2024-06-20T12:00:00Z').latDeg).toBeCloseTo(23.44, 0);
    expect(subSolar('2024-12-21T12:00:00Z').latDeg).toBeCloseTo(-23.44, 0);
  });
});

describe('the Moon is tidally locked', () => {
  it('keeps its near side (0°, 0°) toward Earth within libration limits, 2000–2050', () => {
    const moon = body('moon');
    let worstLon = 0, worstLat = 0;
    for (let k = 0; k < 600; k++) {
      const jd = 2451545 + k * 30.7; // ~50 years
      const toEarth = sub(heliocentricPosition(BODIES, 'earth', jd), heliocentricPosition(BODIES, 'moon', jd));
      const { lonDeg, latDeg } = bodyFixedLonLat(toEarth, moon.rotation, jd);
      worstLon = Math.max(worstLon, Math.abs(lonDeg));
      worstLat = Math.max(worstLat, Math.abs(latDeg));
    }
    // Real optical libration: ±7.9° longitude, ±6.7° latitude. Our fixed pole adds a few degrees.
    expect(worstLon).toBeLessThan(12);
    expect(worstLat).toBeLessThan(12);
  });
});

describe('orbitalPeriodDays', () => {
  it('Earth ≈ 365.256 d, Moon = 27.322 d', () => {
    expect(orbitalPeriodDays(body('earth').orbit!)).toBeCloseTo(365.256, 2);
    expect(orbitalPeriodDays(body('moon').orbit!)).toBe(27.322);
  });
});

describe('solarDayDays', () => {
  it.each([
    ['Earth', 23.9345 / 24, 365.256, 1.0, 3],
    ['Mercury', 1407.6 / 24, 87.969, 175.94, 1],
    ['Venus (retrograde)', -5832.6 / 24, 224.701, 116.75, 1],
    ['Moon (synodic month)', 27.3217, 365.256, 29.531, 2],
    ['Mars', 24.6229 / 24, 686.98, 1.0275, 3],
  ])('%s', (_name, rotation, orbit, expected, digits) => {
    expect(solarDayDays(rotation, orbit)).toBeCloseTo(expected, digits);
  });
});
