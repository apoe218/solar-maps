import { describe, expect, it } from 'vitest';
import { BODIES } from '../src/data/bodies';
import { AU_KM, distance, heliocentricPosition, relativePosition, scale } from '../src/ephemeris';
import fixture from './fixtures/horizons.json';

interface HorizonsEntry {
  body: string;
  jd: number;
  x: number;
  y: number;
  z: number;
  toleranceAu?: number;
}

const DEFAULT_TOLERANCE_AU = 0.01;
const entries = (fixture as { entries: HorizonsEntry[] }).entries;

describe('ephemeris vs JPL Horizons (tests/fixtures/horizons.json)', () => {
  if (entries.length === 0) {
    it.skip('no Horizons entries yet — see the _README in tests/fixtures/horizons.json', () => {});
    return;
  }
  for (const e of entries) {
    const tol = e.toleranceAu ?? DEFAULT_TOLERANCE_AU;
    it(`${e.body} @ JD ${e.jd} within ${tol} AU`, () => {
      const err = distance(heliocentricPosition(BODIES, e.body, e.jd), e);
      expect(err).toBeLessThan(tol);
    });
  }
});

interface RelativeEntry {
  body: string;
  jd: number;
  x: number;
  y: number;
  z: number;
  toleranceKm: number;
}
const relativeEntries = (fixture as { relativeEntries?: RelativeEntry[] }).relativeEntries ?? [];

describe('moons vs JPL Horizons, relative to their parent (km)', () => {
  if (relativeEntries.length === 0) {
    it.skip('no relative entries yet — see tests/fixtures/horizons.json', () => {});
    return;
  }
  for (const e of relativeEntries) {
    it(`${e.body} @ JD ${e.jd} within ${e.toleranceKm} km`, () => {
      const body = BODIES.find((b) => b.id === e.body)!;
      const err = distance(scale(relativePosition(body, e.jd), AU_KM), e);
      expect(err).toBeLessThan(e.toleranceKm);
    });
  }
});
