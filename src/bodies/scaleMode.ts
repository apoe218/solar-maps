/** CLAUDE.md "Scale modes". */
export type ScaleMode = 'explorer' | 'true';

/** Default minimum on-screen diameter in Explorer mode, CSS pixels (per-body override: render.minPixels). */
export const DEFAULT_MIN_PIXELS = 6;

/** Size of one CSS pixel, in world units, at `distance` from a perspective camera. */
export function worldUnitsPerPixel(distance: number, fovDeg: number, viewportHeightPx: number): number {
  return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeightPx;
}

/**
 * Radius to draw a body at. True scale: the real radius. Explorer: real radius, but never smaller
 * than `minPixels` across on screen, so the body stays visible and clickable at any zoom.
 */
export function displayRadius(
  mode: ScaleMode,
  realRadius: number,
  distanceToCamera: number,
  fovDeg: number,
  viewportHeightPx: number,
  minPixels = DEFAULT_MIN_PIXELS,
): number {
  if (mode === 'true') return realRadius;
  const minRadius = (minPixels / 2) * worldUnitsPerPixel(distanceToCamera, fovDeg, viewportHeightPx);
  return Math.max(realRadius, minRadius);
}
