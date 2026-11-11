import { describe, expect, it } from 'vitest';
import { BODIES } from '../src/data/bodies';
import { distance, heliocentricPosition } from '../src/ephemeris';
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
