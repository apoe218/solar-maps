import { describe, expect, it } from 'vitest';
import {
  DOT_OFF_ABOVE_PX,
  DOT_ON_BELOW_PX,
  TRUE_SCALE_DOT_PIXELS,
  appearance,
  projectedDiameterPx,
  worldUnitsPerPixel,
} from '../src/bodies/scaleMode';

describe('scale modes', () => {
  it('pixel size grows linearly with distance', () => {
    expect(worldUnitsPerPixel(10, 90, 1000)).toBeCloseTo(0.02, 12); // fov 90°: screen spans 2·d
    expect(projectedDiameterPx(1, 100, 90, 1000)).toBeCloseTo(10, 9);
  });

  it('explorer: real sphere when big, enlarged to the minimum when small, dot when sub-pixel', () => {
    expect(appearance('explorer', 50, false, 6)).toEqual({ dot: false, dotPx: 6, sphereScale: 1 });
    expect(appearance('explorer', 2, false, 6)).toEqual({ dot: false, dotPx: 6, sphereScale: 3 });
    expect(appearance('explorer', 0.1, false, 6).dot).toBe(true);
  });

  it('true scale: never enlarged; 2 px dot when sub-pixel', () => {
    expect(appearance('true', 2, false).sphereScale).toBe(1);
    expect(appearance('true', 0.1, false)).toEqual({ dot: true, dotPx: TRUE_SCALE_DOT_PIXELS, sphereScale: 1 });
  });

  it('has hysteresis around 1 px, so hovering at the threshold does not flicker', () => {
    let dot = false;
    const seq: boolean[] = [];
    for (const px of [1.1, 0.9, 1.1, 0.79, 0.9, 1.1, 1.19, 1.21, 1.1, 0.9]) {
      dot = appearance('explorer', px, dot).dot;
      seq.push(dot);
    }
    expect(seq).toEqual([false, false, false, true, true, true, true, false, false, false]);
    expect(DOT_ON_BELOW_PX).toBeLessThan(DOT_OFF_ABOVE_PX);
  });
});
