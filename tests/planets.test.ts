import { describe, expect, it } from 'vitest';
import { BODIES, parseBodies } from '../src/data/bodies';
import raw from '../src/data/bodies.json';
import { dateToJulianDate, heliocentricPosition, length } from '../src/ephemeris';

const at = (iso: string) => dateToJulianDate(new Date(iso));
const r = (id: string, jd: number) => length(heliocentricPosition(BODIES, id, jd));

describe('bodies.json', () => {
  it('validates', () => {
    expect(() => parseBodies(raw)).not.toThrow();
  });

  it('has the Sun, eight planets, Pluto and the Moon', () => {
    expect(BODIES.map((b) => b.id).sort()).toEqual(
      ['earth', 'jupiter', 'mars', 'mercury', 'moon', 'neptune', 'pluto', 'saturn', 'sun', 'uranus', 'venus'],
    );
  });

  it('rejects bad data with a useful message', () => {
    const ok = {
      id: 'x', name: 'X', type: 'planet', parent: null,
      physical: { meanRadiusKm: 1, axialTiltDeg: 0, siderealRotationHours: 1 },
      rotation: { poleRaDeg: 0, poleDecDeg: 90, w0Deg: 0, wDotDegPerDay: 1 },
      render: { color: '#fff' },
    };
    expect(() => parseBodies({ bodies: [ok] })).not.toThrow();
    expect(() => parseBodies({ bodies: [{ ...ok, parent: 'nope' }] })).toThrow(/unknown parent "nope"/);
    expect(() => parseBodies({ bodies: [{ ...ok, rotation: { poleRaDeg: 0 } }] })).toThrow(/rotation\.poleDecDeg/);
    expect(() => parseBodies({ bodies: [{ ...ok, render: {} }] })).toThrow(/render\.color/);
  });
});

describe('Earth', () => {
  it('is about 1 AU from the Sun on dates across 1800–2050', () => {
    for (const iso of ['1800-03-01', '1900-06-15', '1969-07-20', '2000-01-01', '2026-01-01', '2050-10-31']) {
      const d = r('earth', at(`${iso}T00:00:00Z`));
      expect(d).toBeGreaterThan(0.983);
      expect(d).toBeLessThan(1.017);
    }
  });

  it('is near perihelion in early January and aphelion in early July', () => {
    expect(r('earth', at('2024-01-03T00:00:00Z'))).toBeCloseTo(0.9833, 3);
    expect(r('earth', at('2024-07-05T00:00:00Z'))).toBeCloseTo(1.0167, 3);
  });

  it('the Sun sits at the origin', () => {
    expect(r('sun', at('2026-01-01T00:00:00Z'))).toBe(0);
  });
});

describe('planets', () => {
  it('mean heliocentric distance over one orbit ≈ a(1 + e²/2)', () => {
    for (const b of BODIES) {
      if (b.orbit?.model !== 'standish') continue;
      const { a, e } = b.orbit.elements;
      const periodDays = (360 / b.orbit.ratesPerCentury.L) * 36525;
      const N = 2000;
      let sum = 0;
      for (let k = 0; k < N; k++) sum += r(b.id, 2451545 + (k / N) * periodDays);
      // time-averaged r = a(1 + e²/2)
      expect(sum / N / (a * (1 + (e * e) / 2)), b.id).toBeCloseTo(1, 3);
    }
  });
});
