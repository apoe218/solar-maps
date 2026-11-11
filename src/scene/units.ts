/**
 * The ONLY place where ephemeris units (AU) are converted to scene units.
 * Placeholder: real scale is decided in a later phase.
 */
export const SCENE_UNITS_PER_AU = 1;

export function auToScene(au: number): number {
  return au * SCENE_UNITS_PER_AU;
}
