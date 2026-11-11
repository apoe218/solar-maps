import { Vector3, type PerspectiveCamera } from 'three';

export interface Pickable {
  id: string;
  /** camera-relative scene position (floating origin) */
  scenePosition: Vector3;
  /** radius of what's drawn, in CSS px on screen */
  screenRadiusPx: number;
  visible: boolean;
  /** drawn at its real size (not a dot or an enlarged sphere) */
  resolved: boolean;
  /** tie-breaker for overlapping markers: bigger bodies win (radius, km) */
  importance: number;
}

/** Extra slop around small targets, CSS px (fingers are bigger than cursors). */
export const PICK_TOLERANCE_PX = { mouse: 8, touch: 18 } as const;

/**
 * Body under a screen point.
 * - Exact hits (inside the drawn disc): the front-most, if it is drawn at real size. If the front-most is
 *   only a marker (dot / enlarged sphere), markers overlap meaninglessly (Earth and the Moon at
 *   solar-system scale), so the most important overlapping marker wins — Earth, not the Moon.
 * - Otherwise the nearest disc edge within the tolerance (ties within 2 px → the more important body).
 * Returns null when nothing is close enough.
 */
export function pickBody(
  items: readonly Pickable[],
  xPx: number,
  yPx: number,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
  tolerancePx: number,
): string | null {
  const exact: { it: Pickable; depth: number }[] = [];
  let near: { it: Pickable; gap: number } | null = null;
  const v = new Vector3();
  for (const it of items) {
    if (!it.visible) continue;
    const depth = v.copy(it.scenePosition).applyMatrix4(camera.matrixWorldInverse).z;
    if (depth >= 0) continue; // behind the camera
    v.copy(it.scenePosition).project(camera);
    const sx = ((v.x + 1) / 2) * viewportWidth;
    const sy = ((1 - v.y) / 2) * viewportHeight;
    const gap = Math.hypot(sx - xPx, sy - yPx) - it.screenRadiusPx;
    if (gap <= 0) exact.push({ it, depth: -depth });
    else if (gap <= tolerancePx) {
      const better = !near || gap < near.gap - 2 || (gap < near.gap + 2 && it.importance > near.it.importance);
      if (better) near = { it, gap };
    }
  }
  if (exact.length > 0) {
    exact.sort((a, b) => a.depth - b.depth);
    const front = exact[0]!.it;
    if (front.resolved) return front.id;
    const markers = exact.filter((e) => !e.it.resolved).map((e) => e.it);
    return markers.reduce((a, b) => (b.importance > a.importance ? b : a)).id;
  }
  return near?.it.id ?? null;
}

/** World-space ray direction through a screen point, for a camera with the given orientation. */
export function rayThroughPixel(
  xPx: number,
  yPx: number,
  viewportWidth: number,
  viewportHeight: number,
  camera: PerspectiveCamera,
  out = new Vector3(),
): Vector3 {
  const ndcX = (xPx / viewportWidth) * 2 - 1;
  const ndcY = 1 - (yPx / viewportHeight) * 2;
  const t = Math.tan((camera.fov * Math.PI) / 360);
  return out.set(ndcX * t * camera.aspect, ndcY * t, -1).normalize().applyQuaternion(camera.quaternion);
}

/** Distance along a ray (from the origin) to a sphere, or null if it misses. */
export function raySphere(dir: Vector3, centre: Vector3, radius: number): number | null {
  const b = dir.dot(centre);
  const c = centre.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = b - Math.sqrt(disc);
  return t > 0 ? t : b + Math.sqrt(disc) > 0 ? 0 : null; // inside the sphere → 0
}
