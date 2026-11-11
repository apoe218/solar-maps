import { AU_KM, DAYS_PER_JULIAN_YEAR, deg2rad } from './constants';
import { solveKepler } from './kepler';
import { referenceToEcliptic, type KeplerianOrbit } from './moons';
import { orbitalToReference } from './orbit';
import type { StandishOrbit } from './planets';
import { centuriesSinceJ2000 } from './time';
import type { Vec3 } from './vector';

/**
 * The osculating ellipse of an orbit at one instant, in ecliptic J2000 (AU):
 * position(E) = a(cos E − e)·P + a√(1−e²)·sin E·Q, with P toward periapsis and Q 90° ahead in the orbit plane.
 * `E` is the body's eccentric anomaly at that instant.
 */
export interface OrbitEllipse {
  a: number;
  e: number;
  E: number;
  P: Vec3;
  Q: Vec3;
}

export function orbitEllipse(orbit: StandishOrbit | KeplerianOrbit, jd: number): OrbitEllipse {
  if (orbit.model === 'standish') {
    const T = centuriesSinceJ2000(jd);
    const { elements: el, ratesPerCentury: r } = orbit;
    const a = el.a + r.a * T;
    const e = el.e + r.e * T;
    const I = deg2rad(el.I + r.I * T);
    const L = deg2rad(el.L + r.L * T);
    const varpi = deg2rad(el.varpi + r.varpi * T);
    const Omega = deg2rad(el.Omega + r.Omega * T);
    const omega = varpi - Omega;
    return {
      a,
      e,
      E: solveKepler(L - varpi, e), // M = L − ϖ; Table 1 has no extra terms
      P: orbitalToReference({ x: 1, y: 0 }, omega, Omega, I),
      Q: orbitalToReference({ x: 0, y: 1 }, omega, Omega, I),
    };
  }
  const dt = jd - orbit.epochJd;
  const rate = (years: number | undefined) => (years ? 360 / (years * DAYS_PER_JULIAN_YEAR) : 0); // deg/day
  const dOmega = rate(orbit.nodePrecessionYears);
  const domega = rate(orbit.argPeriapsisPrecessionYears);
  const Omega = deg2rad(orbit.OmegaDeg + dOmega * dt);
  const omega = deg2rad(orbit.omegaDeg + domega * dt);
  const I = deg2rad(orbit.iDeg);
  // periodDays is sidereal (mean longitude λ = Ω + ω + M), so M advances at n − dϖ/dt.
  const M = deg2rad(orbit.meanAnomalyDeg + (360 / orbit.periodDays - dOmega - domega) * dt);
  return {
    a: orbit.aKm / AU_KM,
    e: orbit.e,
    E: solveKepler(M, orbit.e),
    P: referenceToEcliptic(orbitalToReference({ x: 1, y: 0 }, omega, Omega, I), orbit.referencePlane),
    Q: referenceToEcliptic(orbitalToReference({ x: 0, y: 1 }, omega, Omega, I), orbit.referencePlane),
  };
}

/** Point on the ellipse at eccentric anomaly E (AU, ecliptic J2000). */
export function ellipsePoint(el: OrbitEllipse, E: number): Vec3 {
  const x = el.a * (Math.cos(E) - el.e);
  const y = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  return { x: x * el.P.x + y * el.Q.x, y: x * el.P.y + y * el.Q.y, z: x * el.P.z + y * el.Q.z };
}
