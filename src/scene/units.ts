import { Vector3 } from 'three';
import { AU_KM, type Vec3 } from '../ephemeris';

/**
 * The ONLY place where ephemeris units are converted to scene units (CLAUDE.md, hard rule 1).
 *
 * 1 scene unit = 1 million km, so 1 AU ≈ 149.6 units and Neptune sits at ~4,500 units.
 *
 * Axes: the ephemeris uses ecliptic J2000 (x → vernal equinox, z → ecliptic north). Three.js is Y-up,
 * so scene = (x, z, −y): ecliptic north is scene +Y. This is a proper rotation (no mirroring).
 */
export const KM_PER_SCENE_UNIT = 1e6;
export const SCENE_UNITS_PER_AU = AU_KM / KM_PER_SCENE_UNIT;

export const kmToScene = (km: number): number => km / KM_PER_SCENE_UNIT;
export const auToScene = (au: number): number => au * SCENE_UNITS_PER_AU;

/** Ecliptic direction (unitless) → scene axes. */
export function eclipticDirToScene(v: Vec3, out = new Vector3()): Vector3 {
  return out.set(v.x, v.z, -v.y);
}

/** Ecliptic position in AU → scene position in scene units. */
export function eclipticAuToScene(v: Vec3, out = new Vector3()): Vector3 {
  return out.set(auToScene(v.x), auToScene(v.z), -auToScene(v.y));
}
