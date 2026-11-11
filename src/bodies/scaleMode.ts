/** CLAUDE.md "Scale modes". */
export type ScaleMode = 'explorer' | 'true';

/** Default minimum on-screen diameter in Explorer mode, CSS pixels (per-body override: render.minPixels). */
export const DEFAULT_MIN_PIXELS = 6;
/** Dot size for sub-pixel bodies in True scale, CSS px: "tiny dots" that don't twinkle. */
export const TRUE_SCALE_DOT_PIXELS = 2;
/** Switch to the dot below this projected diameter (px) and back above the other: hysteresis prevents flicker. */
export const DOT_ON_BELOW_PX = 0.8;
export const DOT_OFF_ABOVE_PX = 1.2;

/** Size of one CSS pixel, in world units, at `distance` from a perspective camera. */
export function worldUnitsPerPixel(distance: number, fovDeg: number, viewportHeightPx: number): number {
  return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeightPx;
}

/** Projected diameter in CSS px of a sphere of `radius` at `distance` (same units). */
export function projectedDiameterPx(radius: number, distance: number, fovDeg: number, viewportHeightPx: number): number {
  return (2 * radius) / worldUnitsPerPixel(Math.max(distance, radius), fovDeg, viewportHeightPx);
}

export interface Appearance {
  /** draw a flat dot instead of the sphere */
  dot: boolean;
  /** dot diameter, CSS px */
  dotPx: number;
  /** sphere scale factor relative to the real radius (≥ 1) */
  sphereScale: number;
}

/**
 * How to draw a body:
 * - projected ≥ minPixels: real sphere;
 * - 1 px ≤ projected < minPixels: sphere enlarged to minPixels (Explorer) / real sphere (True);
 * - sub-pixel: flat dot of minPixels (Explorer) / 2 px (True). Sub-pixel spheres would twinkle.
 * `wasDot` gives hysteresis around the 1 px threshold.
 */
export function appearance(
  mode: ScaleMode,
  projectedPx: number,
  wasDot: boolean,
  minPixels = DEFAULT_MIN_PIXELS,
): Appearance {
  const dot = wasDot ? projectedPx < DOT_OFF_ABOVE_PX : projectedPx < DOT_ON_BELOW_PX;
  const explorer = mode === 'explorer';
  return {
    dot,
    dotPx: explorer ? minPixels : TRUE_SCALE_DOT_PIXELS,
    sphereScale: explorer && !dot ? Math.max(1, minPixels / projectedPx) : 1,
  };
}
