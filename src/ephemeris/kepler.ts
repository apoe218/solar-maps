import { wrapPi } from './constants';

export const KEPLER_TOLERANCE = 1e-8;
const MAX_ITERATIONS = 50;

/**
 * Solve Kepler's equation M = E − e·sin E for the eccentric anomaly E (radians),
 * for elliptical orbits (0 ≤ e < 1), by Newton iteration until |ΔE| ≤ tol.
 * M is wrapped to [−π, π) first, so the returned E is in that range too.
 */
export function solveKepler(meanAnomaly: number, e: number, tol = KEPLER_TOLERANCE): number {
  if (!(e >= 0 && e < 1)) throw new RangeError(`solveKepler: eccentricity must be in [0, 1), got ${e}`);
  const M = wrapPi(meanAnomaly);
  if (e === 0) return M;
  // For high e, starting at π avoids Newton overshooting near M ≈ 0.
  let E = e > 0.8 ? (M < 0 ? -Math.PI : Math.PI) : M + e * Math.sin(M);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) <= tol) return E;
  }
  throw new Error(`solveKepler: did not converge (M=${meanAnomaly}, e=${e})`);
}
