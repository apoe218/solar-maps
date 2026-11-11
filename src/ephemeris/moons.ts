import { OBLIQUITY_J2000_DEG, deg2rad } from './constants';
import { ellipsePoint, orbitEllipse } from './ellipse';
import type { Vec3 } from './vector';

/**
 * Plane the moon's elements are referred to:
 * - "ecliptic": the J2000 ecliptic (e.g. Earth's Moon), Ω measured from the J2000 equinox;
 * - a pole in J2000 equatorial coordinates (e.g. a JPL local Laplace plane), Ω measured from that
 *   plane's ascending node on the J2000 equator.
 */
export type ReferencePlane = 'ecliptic' | { poleRaDeg: number; poleDecDeg: number };

/** Simplified Keplerian mean elements of a moon relative to its parent (JPL SSD style). */
export interface KeplerianOrbit {
  model: 'keplerian';
  /** epoch of the elements, Julian Date */
  epochJd: number;
  /** semi-major axis, km */
  aKm: number;
  e: number;
  iDeg: number;
  /** longitude of ascending node at epoch, deg */
  OmegaDeg: number;
  /** argument of periapsis at epoch, deg */
  omegaDeg: number;
  /** mean anomaly at epoch, deg */
  meanAnomalyDeg: number;
  /** sidereal orbital period, days (rate of mean longitude) */
  periodDays: number;
  /** precession period of ω, Julian years; negative = regression. Omit for none. */
  argPeriapsisPrecessionYears?: number;
  /** precession period of Ω, Julian years; negative = regression. Omit for none. */
  nodePrecessionYears?: number;
  referencePlane: ReferencePlane;
}

/** Rotate from equatorial J2000 to ecliptic J2000 (rotation about x by −ε). */
export function equatorialToEcliptic(v: Vec3): Vec3 {
  const eps = deg2rad(OBLIQUITY_J2000_DEG);
  const c = Math.cos(eps), s = Math.sin(eps);
  return { x: v.x, y: c * v.y + s * v.z, z: -s * v.y + c * v.z };
}

/** Rotate a vector from a plane with the given equatorial pole into equatorial J2000. */
export function planeToEquatorial(v: Vec3, poleRaDeg: number, poleDecDeg: number): Vec3 {
  // Plane frame: x = ascending node on the equator (RA α+90°), z = pole.
  // This is orbitalToReference with Ω = α + 90°, I = 90° − δ, ω = 0.
  const ra = deg2rad(poleRaDeg), dec = deg2rad(poleDecDeg);
  const node = { x: -Math.sin(ra), y: Math.cos(ra), z: 0 };
  const pole = { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
  const yAxis = {
    x: pole.y * node.z - pole.z * node.y,
    y: pole.z * node.x - pole.x * node.z,
    z: pole.x * node.y - pole.y * node.x,
  };
  return {
    x: node.x * v.x + yAxis.x * v.y + pole.x * v.z,
    y: node.y * v.x + yAxis.y * v.y + pole.y * v.z,
    z: node.z * v.x + yAxis.z * v.y + pole.z * v.z,
  };
}

/** Position of a moon relative to its parent, ecliptic J2000, AU, at Julian Date `jd`. */
export function keplerianPosition(orbit: KeplerianOrbit, jd: number): Vec3 {
  const el = orbitEllipse(orbit, jd);
  return ellipsePoint(el, el.E);
}

/** Rotate a vector from an orbit's reference plane frame into ecliptic J2000. */
export function referenceToEcliptic(v: Vec3, plane: ReferencePlane): Vec3 {
  if (plane === 'ecliptic') return v;
  return equatorialToEcliptic(planeToEquatorial(v, plane.poleRaDeg, plane.poleDecDeg));
}
