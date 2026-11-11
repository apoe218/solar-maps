import { DAYS_PER_CENTURY, J2000_JD, deg2rad } from './constants';
import { equatorialToEcliptic, type KeplerianOrbit } from './moons';
import type { StandishOrbit } from './planets';
import { centuriesSinceJ2000 } from './time';
import type { Vec3 } from './vector';

/** Unit vector, ecliptic J2000, for a direction given in J2000 equatorial RA/Dec (degrees). */
export function equatorialDirectionToEcliptic(raDeg: number, decDeg: number): Vec3 {
  const ra = deg2rad(raDeg), dec = deg2rad(decDeg);
  return equatorialToEcliptic({ x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) });
}

/** Unit orbit normal (direction of orbital angular momentum), ecliptic J2000, at Julian Date `jd`. */
export function orbitNormal(orbit: StandishOrbit | KeplerianOrbit, jd: number): Vec3 {
  let I: number, Omega: number;
  if (orbit.model === 'standish') {
    const T = centuriesSinceJ2000(jd);
    I = deg2rad(orbit.elements.I + orbit.ratesPerCentury.I * T);
    Omega = deg2rad(orbit.elements.Omega + orbit.ratesPerCentury.Omega * T);
  } else {
    // At epoch, ignoring precession and the reference plane's tilt (exact for ecliptic-referred orbits).
    I = deg2rad(orbit.iDeg);
    Omega = deg2rad(orbit.OmegaDeg);
  }
  return { x: Math.sin(I) * Math.sin(Omega), y: -Math.sin(I) * Math.cos(Omega), z: Math.cos(I) };
}

/** Sidereal orbital period in days. */
export function orbitalPeriodDays(orbit: StandishOrbit | KeplerianOrbit): number {
  return orbit.model === 'standish' ? (360 / orbit.ratesPerCentury.L) * DAYS_PER_CENTURY : orbit.periodDays;
}

/** Angle between two unit vectors, degrees. */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const d = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(d) / deg2rad(1);
}

/**
 * Body-fixed frame from IAU rotational elements, as ecliptic-J2000 unit vectors:
 * `node` = ascending node of the body's equator on the J2000 equator (where W is measured from),
 * `pole` = IAU north pole, `east` = pole × node.
 */
export function iauEquatorFrame(poleRaDeg: number, poleDecDeg: number): { node: Vec3; east: Vec3; pole: Vec3 } {
  const ra = deg2rad(poleRaDeg);
  const node = equatorialToEcliptic({ x: -Math.sin(ra), y: Math.cos(ra), z: 0 });
  const pole = equatorialDirectionToEcliptic(poleRaDeg, poleDecDeg);
  const east = {
    x: pole.y * node.z - pole.z * node.y,
    y: pole.z * node.x - pole.x * node.z,
    z: pole.x * node.y - pole.y * node.x,
  };
  return { node, east, pole };
}

/** IAU prime-meridian angle W at Julian Date `jd`, degrees in [0, 360). */
export function primeMeridianDeg(w0Deg: number, wDotDegPerDay: number, jd: number): number {
  const w = (w0Deg + wDotDegPerDay * (jd - J2000_JD)) % 360;
  return w < 0 ? w + 360 : w;
}

/**
 * Planetocentric east longitude and latitude (deg) of an ecliptic direction, in the body-fixed
 * frame defined by IAU rotational elements at Julian Date `jd`. Longitude in (−180, 180].
 */
export function bodyFixedLonLat(
  dir: Vec3,
  rot: { poleRaDeg: number; poleDecDeg: number; w0Deg: number; wDotDegPerDay: number },
  jd: number,
): { lonDeg: number; latDeg: number } {
  const { node, east, pole } = iauEquatorFrame(rot.poleRaDeg, rot.poleDecDeg);
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  const len = Math.hypot(dir.x, dir.y, dir.z);
  const inertialLon = Math.atan2(dot(dir, east), dot(dir, node)) / deg2rad(1);
  const latDeg = Math.asin(dot(dir, pole) / len) / deg2rad(1);
  let lonDeg = inertialLon - primeMeridianDeg(rot.w0Deg, rot.wDotDegPerDay, jd);
  lonDeg = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  return { lonDeg: lonDeg === -180 ? 180 : lonDeg, latDeg };
}
