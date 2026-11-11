import { Vector3 } from 'three';
import { AU_KM, type Vec3 } from '../ephemeris';

/**
 * The ONLY place where ephemeris units become world / scene units (CLAUDE.md, hard rules 1–2).
 *
 * Three coordinate spaces:
 * - **Ephemeris**: ecliptic J2000, AU (x → vernal equinox, z → ecliptic north).
 * - **World**: float64 km on the CPU, Sun at the origin, Y-up axes: world = (x, z, −y)·AU_KM.
 *   Never sent to the GPU.
 * - **Scene** (render): world − cameraWorld, in scene units. The camera always sits at (0,0,0), so
 *   everything near it has small coordinates and keeps full float32 precision.
 *
 * 1 scene unit = 1 km. Small units matter: the log depth buffer works on log2(1 + w), which loses
 * resolution for w ≪ 1, so with 10⁶ km units a surface 10 km away would z-fight.
 */
export const KM_PER_SCENE_UNIT = 1;

export const kmToScene = (km: number): number => km / KM_PER_SCENE_UNIT;
export const sceneToKm = (u: number): number => u * KM_PER_SCENE_UNIT;
export const auToKm = (au: number): number => au * AU_KM;

/** Ecliptic direction (unitless) → world/scene axes. */
export function eclipticDirToScene(v: Vec3, out = new Vector3()): Vector3 {
  return out.set(v.x, v.z, -v.y);
}

/** Ecliptic position or displacement in AU → world km (float64, Y-up). */
export function eclipticAuToWorldKm(v: Vec3, out = new Vector3()): Vector3 {
  return out.set(auToKm(v.x), auToKm(v.z), -auToKm(v.y));
}

/** Ecliptic displacement in AU → scene units (for geometry stored relative to a body, e.g. orbit lines). */
export function eclipticAuToSceneDelta(v: Vec3, out = new Vector3()): Vector3 {
  return out.set(kmToScene(auToKm(v.x)), kmToScene(auToKm(v.z)), -kmToScene(auToKm(v.y)));
}

/** Floating origin: world km → scene position relative to the camera. */
export function worldToScene(worldKm: Vector3, cameraWorldKm: Vector3, out = new Vector3()): Vector3 {
  return out.subVectors(worldKm, cameraWorldKm).divideScalar(KM_PER_SCENE_UNIT);
}

/** Spacing between adjacent float32 values near |x| — what the GPU can resolve at that magnitude. */
export function float32Step(x: number): number {
  const a = Math.abs(x);
  if (a === 0) return 1.4e-45;
  return 2 ** (Math.floor(Math.log2(a)) - 23);
}
