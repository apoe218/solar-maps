import { describe, expect, it } from 'vitest';
import { BODIES } from '../src/data/bodies';
import {
  AU_KM,
  OBLIQUITY_J2000_DEG,
  distance,
  equatorialToEcliptic,
  heliocentricPosition,
  keplerianPosition,
  length,
  type KeplerianOrbit,
} from '../src/ephemeris';

const base: KeplerianOrbit = {
  model: 'keplerian', epochJd: 2451545, aKm: 100_000, e: 0, iDeg: 0, OmegaDeg: 0, omegaDeg: 0,
  meanAnomalyDeg: 0, periodDays: 10, referencePlane: 'ecliptic',
};
const close = (a: { x: number; y: number; z: number }, b: typeof a) => expect(distance(a, b)).toBeLessThan(1e-12);

describe('keplerianPosition', () => {
  it('circular orbit has |r| = a at all times', () => {
    for (let t = 0; t < 20; t += 0.7) {
      expect(length(keplerianPosition(base, 2451545 + t)) * AU_KM).toBeCloseTo(100_000, 6);
    }
  });

  it('returns to the same place after one period', () => {
    const orbit = { ...base, e: 0.3, iDeg: 20, OmegaDeg: 40, omegaDeg: 70, meanAnomalyDeg: 15 };
    close(keplerianPosition(orbit, 2451545 + 3.3), keplerianPosition(orbit, 2451545 + 3.3 + 10));
  });

  it('starts at periapsis distance a(1 − e) when M = 0', () => {
    expect(length(keplerianPosition({ ...base, e: 0.5 }, 2451545)) * AU_KM).toBeCloseTo(50_000, 6);
  });

  it('a plane whose pole is the ecliptic pole equals the ecliptic plane', () => {
    const orbit = { ...base, e: 0.2, iDeg: 10, OmegaDeg: 30, omegaDeg: 50, meanAnomalyDeg: 77 };
    const eclipticPole = { poleRaDeg: 270, poleDecDeg: 90 - OBLIQUITY_J2000_DEG };
    close(keplerianPosition({ ...orbit, referencePlane: eclipticPole }, 2451550),
          keplerianPosition(orbit, 2451550));
  });

  it('an equatorial plane is the ecliptic result rotated by the obliquity', () => {
    const orbit = { ...base, e: 0.1, iDeg: 5, OmegaDeg: 10, omegaDeg: 20, meanAnomalyDeg: 30 };
    // pole at δ = 90°: plane node direction is RA α+90°; with α = 270° that is the equinox.
    const eq = keplerianPosition({ ...orbit, referencePlane: { poleRaDeg: 270, poleDecDeg: 90 } }, 2451552);
    close(eq, equatorialToEcliptic(keplerianPosition(orbit, 2451552)));
  });

  it('precession moves the node at the stated rate, keeping the sidereal period', () => {
    // Node regresses 360°/yr. Mean longitude advances at 360°/P, so the argument of latitude
    // u = M advances at (n − dΩ/dt). With P = Y/3, after Y/4: u = 270° + 90° = 360° → at the
    // ascending node, which has regressed to Ω = −90°, i.e. direction (0, −1, 0).
    const Y = 365.25;
    const orbit = { ...base, iDeg: 30, periodDays: Y / 3, nodePrecessionYears: -1 };
    const p = keplerianPosition(orbit, 2451545 + Y / 4);
    const a = 100_000 / AU_KM;
    close(p, { x: 0, y: -a, z: 0 });
  });
});

describe('the Moon (bodies.json)', () => {
  it('stays 356,000–407,000 km from Earth', () => {
    for (let k = 0; k < 400; k++) {
      const jd = 2451545 + k * 9.13; // ~10 years, sampled across phases
      const d = distance(heliocentricPosition(BODIES, 'moon', jd), heliocentricPosition(BODIES, 'earth', jd)) * AU_KM;
      expect(d).toBeGreaterThan(356_000);
      expect(d).toBeLessThan(407_000);
    }
  });

  it('is within ~5.2° of the ecliptic', () => {
    for (let k = 0; k < 200; k++) {
      const jd = 2451545 + k * 3.7;
      const rel = keplerianPosition(BODIES.find((b) => b.id === 'moon')!.orbit as KeplerianOrbit, jd);
      expect(Math.abs(Math.asin(rel.z / length(rel))) * (180 / Math.PI)).toBeLessThan(5.17);
    }
  });
});
