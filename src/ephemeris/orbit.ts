import type { Vec3 } from './vector';

/** Position in the orbital plane (x toward periapsis), same length unit as `a`. */
export function orbitalPlanePosition(a: number, e: number, E: number): { x: number; y: number } {
  return { x: a * (Math.cos(E) - e), y: a * Math.sqrt(1 - e * e) * Math.sin(E) };
}

/**
 * Rotate an orbital-plane position into the reference frame of the elements
 * (Standish eq. 8.4): ω = argument of periapsis, Ω = longitude of ascending node, I = inclination, radians.
 */
export function orbitalToReference(p: { x: number; y: number }, omega: number, Omega: number, I: number): Vec3 {
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(Omega), sO = Math.sin(Omega);
  const cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * p.x + (-sw * cO - cw * sO * cI) * p.y,
    y: (cw * sO + sw * cO * cI) * p.x + (-sw * sO + cw * cO * cI) * p.y,
    z: sw * sI * p.x + cw * sI * p.y,
  };
}
