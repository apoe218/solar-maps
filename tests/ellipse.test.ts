import { describe, expect, it } from 'vitest';
import { BODIES } from '../src/data/bodies';
import { distance, ellipsePoint, orbitEllipse, relativePosition } from '../src/ephemeris';

describe('orbitEllipse', () => {
  it.each(BODIES.filter((b) => b.orbit).map((b) => [b.id, b] as const))(
    '%s: the ellipse at E passes through the ephemeris position, and is closed',
    (_id, b) => {
      const jd = 2461041.5;
      const el = orbitEllipse(b.orbit!, jd);
      expect(distance(ellipsePoint(el, el.E), relativePosition(b, jd))).toBe(0);
      expect(distance(ellipsePoint(el, el.E + 2 * Math.PI), ellipsePoint(el, el.E))).toBeLessThan(1e-12 * el.a);
      // P and Q are orthonormal
      const dot = el.P.x * el.Q.x + el.P.y * el.Q.y + el.P.z * el.Q.z;
      expect(Math.abs(dot)).toBeLessThan(1e-12);
      expect(Math.hypot(el.P.x, el.P.y, el.P.z)).toBeCloseTo(1, 12);
    },
  );
});
