import { describe, expect, it } from 'vitest';
import { displayRadius, worldUnitsPerPixel } from '../src/bodies/scaleMode';

describe('scale modes', () => {
  it('pixel size grows linearly with distance', () => {
    // fov 90°: the screen spans 2·d vertically
    expect(worldUnitsPerPixel(10, 90, 1000)).toBeCloseTo(0.02, 12);
    expect(worldUnitsPerPixel(20, 90, 1000)).toBeCloseTo(0.04, 12);
  });

  it('true scale always uses the real radius', () => {
    expect(displayRadius('true', 1e-3, 1e6, 50, 800)).toBe(1e-3);
  });

  it('explorer keeps the real radius when it is already big enough on screen', () => {
    expect(displayRadius('explorer', 1, 10, 90, 1000, 6)).toBe(1);
  });

  it('explorer enforces the minimum on-screen diameter when far away', () => {
    const r = displayRadius('explorer', 1e-3, 1000, 90, 1000, 6);
    expect((2 * r) / worldUnitsPerPixel(1000, 90, 1000)).toBeCloseTo(6, 9);
  });
});
