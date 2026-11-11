import { deg2rad } from './constants';
import { solveKepler } from './kepler';
import { orbitalPlanePosition, orbitalToReference } from './orbit';
import { centuriesSinceJ2000 } from './time';
import type { Vec3 } from './vector';

/**
 * Keplerian elements in the form of JPL's "Approximate Positions of the Planets"
 * (E.M. Standish), Table 1, valid 1800–2050. Referred to the mean ecliptic and equinox of J2000.
 */
export interface StandishElements {
  /** semi-major axis, AU */
  a: number;
  /** eccentricity */
  e: number;
  /** inclination, deg */
  I: number;
  /** mean longitude, deg */
  L: number;
  /** longitude of perihelion ϖ, deg */
  varpi: number;
  /** longitude of ascending node Ω, deg */
  Omega: number;
}

export interface StandishOrbit {
  model: 'standish';
  /** values at J2000 */
  elements: StandishElements;
  /** rates of change, same units per Julian century */
  ratesPerCentury: StandishElements;
}

/**
 * Heliocentric ecliptic-J2000 position (AU) at Julian Date `jd` (TDB ≈ UTC), following Standish §8.10.
 *
 * Stated accuracy (Table 1, 1800–2050) is of order arcseconds to arcminutes; Pluto is the least
 * accurate body, since its elements are a fit over a small arc of its 248-year orbit.
 */
export function standishPosition(orbit: StandishOrbit, jd: number): Vec3 {
  const T = centuriesSinceJ2000(jd);
  const { elements: el, ratesPerCentury: r } = orbit;
  const a = el.a + r.a * T;
  const e = el.e + r.e * T;
  const I = deg2rad(el.I + r.I * T);
  const L = deg2rad(el.L + r.L * T);
  const varpi = deg2rad(el.varpi + r.varpi * T);
  const Omega = deg2rad(el.Omega + r.Omega * T);

  const omega = varpi - Omega;
  const M = L - varpi; // Table 1 has no extra b, c, s, f terms
  const E = solveKepler(M, e);
  return orbitalToReference(orbitalPlanePosition(a, e, E), omega, Omega, I);
}
