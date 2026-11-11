import { describe, expect, it } from 'vitest';
import { solveKepler } from '../src/ephemeris';

const grid = Array.from({ length: 721 }, (_, k) => -Math.PI + (k * 2 * Math.PI) / 720);

describe('solveKepler', () => {
  for (const e of [0, 0.2, 0.9]) {
    it(`converges for e = ${e} across M ∈ [-π, π]`, () => {
      for (const M of grid) {
        const E = solveKepler(M, e);
        const Mw = Math.atan2(Math.sin(M), Math.cos(M)); // same wrapping
        const residual = Math.atan2(Math.sin(E - e * Math.sin(E) - Mw), Math.cos(E - e * Math.sin(E) - Mw));
        expect(Math.abs(residual)).toBeLessThan(1e-8);
      }
    });
  }

  it('returns E = M exactly for a circular orbit', () => {
    expect(solveKepler(1.234, 0)).toBe(1.234);
  });

  it('is stable near M ≈ 0 at high eccentricity', () => {
    for (const M of [1e-9, -1e-9, 1e-4, -1e-4]) {
      const E = solveKepler(M, 0.9);
      expect(Math.abs(E - 0.9 * Math.sin(E) - M)).toBeLessThan(1e-8);
    }
  });

  it('matches a known value (M = 1 rad, e = 0.5)', () => {
    expect(solveKepler(1, 0.5)).toBeCloseTo(1.4987011335178482, 8);
  });

  it('rejects non-elliptical eccentricities', () => {
    expect(() => solveKepler(1, 1)).toThrow(RangeError);
    expect(() => solveKepler(1, -0.1)).toThrow(RangeError);
  });
});
