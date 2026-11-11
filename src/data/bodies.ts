import type { Orbit, OrbitingBody } from '../ephemeris';
import raw from './bodies.json';

export type BodyType = 'star' | 'planet' | 'dwarf-planet' | 'moon';

export interface PhysicalData {
  meanRadiusKm: number;
  axialTiltDeg: number;
  /** negative = retrograde */
  siderealRotationHours: number;
}

export interface BodyRecord extends OrbitingBody {
  name: string;
  type: BodyType;
  physical: PhysicalData;
  orbit?: Orbit;
}

const BODY_TYPES: readonly string[] = ['star', 'planet', 'dwarf-planet', 'moon'];
const STANDISH_KEYS = ['a', 'e', 'I', 'L', 'varpi', 'Omega'] as const;
const KEPLERIAN_KEYS = ['epochJd', 'aKm', 'e', 'iDeg', 'OmegaDeg', 'omegaDeg', 'meanAnomalyDeg', 'periodDays'] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(id: string, msg: string): never {
  throw new Error(`bodies.json: "${id}": ${msg}`);
}

function requireNumbers(id: string, where: string, o: unknown, keys: readonly string[]): void {
  if (!isObj(o)) fail(id, `${where} must be an object`);
  for (const k of keys) {
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) fail(id, `${where}.${k} must be a finite number`);
  }
}

/** Validate the raw bodies.json document and return typed records. Throws with a precise message on bad data. */
export function parseBodies(doc: unknown): BodyRecord[] {
  if (!isObj(doc) || !Array.isArray(doc.bodies)) throw new Error('bodies.json: expected { "bodies": [...] }');
  const ids = new Set<string>();
  for (const b of doc.bodies as unknown[]) {
    if (!isObj(b) || typeof b.id !== 'string') throw new Error('bodies.json: every body needs a string "id"');
    const id = b.id;
    if (ids.has(id)) fail(id, 'duplicate id');
    ids.add(id);
    if (typeof b.name !== 'string') fail(id, '"name" must be a string');
    if (typeof b.type !== 'string' || !BODY_TYPES.includes(b.type)) fail(id, `"type" must be one of ${BODY_TYPES.join(', ')}`);
    if (b.parent !== null && typeof b.parent !== 'string') fail(id, '"parent" must be a string or null');
    requireNumbers(id, 'physical', b.physical, ['meanRadiusKm', 'axialTiltDeg', 'siderealRotationHours']);
    if (b.orbit !== undefined) {
      if (!isObj(b.orbit)) fail(id, '"orbit" must be an object');
      if (b.orbit.model === 'standish') {
        requireNumbers(id, 'orbit.elements', b.orbit.elements, STANDISH_KEYS);
        requireNumbers(id, 'orbit.ratesPerCentury', b.orbit.ratesPerCentury, STANDISH_KEYS);
      } else if (b.orbit.model === 'keplerian') {
        requireNumbers(id, 'orbit', b.orbit, KEPLERIAN_KEYS);
        const plane = b.orbit.referencePlane;
        if (plane !== 'ecliptic') requireNumbers(id, 'orbit.referencePlane', plane, ['poleRaDeg', 'poleDecDeg']);
      } else {
        fail(id, 'orbit.model must be "standish" or "keplerian"');
      }
    }
  }
  const bodies = doc.bodies as BodyRecord[];
  for (const b of bodies) if (b.parent !== null && !ids.has(b.parent)) fail(b.id, `unknown parent "${b.parent}"`);
  return bodies;
}

export const BODIES: readonly BodyRecord[] = parseBodies(raw);
