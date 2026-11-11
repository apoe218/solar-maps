import { keplerianPosition, type KeplerianOrbit } from './moons';
import { standishPosition, type StandishOrbit } from './planets';
import { add, vec3, type Vec3 } from './vector';

export type Orbit = StandishOrbit | KeplerianOrbit;

/** Minimal shape of a body record needed to compute positions (matches entries in data/bodies.json). */
export interface OrbitingBody {
  id: string;
  parent: string | null;
  orbit?: Orbit;
}

/** Position of a body relative to its parent, AU, ecliptic J2000. Bodies without an orbit sit at their parent. */
export function relativePosition(body: OrbitingBody, jd: number): Vec3 {
  if (!body.orbit) return vec3(0, 0, 0);
  return body.orbit.model === 'standish' ? standishPosition(body.orbit, jd) : keplerianPosition(body.orbit, jd);
}

/**
 * Heliocentric ecliptic-J2000 position (AU) of body `id`, by summing relative positions up the
 * parent chain. Adding a moon to the data is enough for this to work — no new code.
 */
export function heliocentricPosition(bodies: readonly OrbitingBody[], id: string, jd: number): Vec3 {
  const byId = new Map(bodies.map((b) => [b.id, b]));
  let pos = vec3(0, 0, 0);
  const seen = new Set<string>();
  for (let cur = byId.get(id); cur; cur = cur.parent ? byId.get(cur.parent) : undefined) {
    if (seen.has(cur.id)) throw new Error(`heliocentricPosition: parent cycle at "${cur.id}"`);
    seen.add(cur.id);
    pos = add(pos, relativePosition(cur, jd));
    if (cur.parent && !byId.has(cur.parent)) throw new Error(`Unknown parent "${cur.parent}" of "${cur.id}"`);
  }
  if (seen.size === 0) throw new Error(`heliocentricPosition: unknown body "${id}"`);
  return pos;
}
