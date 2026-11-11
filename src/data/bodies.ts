import type { Orbit, OrbitingBody } from '../ephemeris';
import raw from './bodies.json';

export type BodyType = 'star' | 'planet' | 'dwarf-planet' | 'moon';

export interface PhysicalData {
  meanRadiusKm: number;
  /** obliquity to orbit (fact sheet), deg — informational; orientation comes from the spin pole */
  axialTiltDeg: number;
  /** negative = retrograde (fact-sheet convention) */
  siderealRotationHours: number;
}

/** IAU WGCCRE rotational elements; W is the prime meridian angle east of the equator's node on the J2000 equator. */
export interface RotationData {
  poleRaDeg: number;
  poleDecDeg: number;
  w0Deg: number;
  wDotDegPerDay: number;
}

export interface RingData {
  innerKm: number;
  outerKm: number;
  /** radial strip texture: u = 0 at innerKm, u = 1 at outerKm */
  texture?: string;
}

export interface RenderData {
  /** CSS colour; used as a tint-free fallback when there is no texture */
  color: string;
  /** path relative to the site base, e.g. "textures/2k/earth_daymap.jpg" */
  texture?: string;
  /** Explorer-mode minimum on-screen diameter, px */
  minPixels?: number;
  rings?: RingData;
}

export interface BodyRecord extends OrbitingBody {
  name: string;
  type: BodyType;
  physical: PhysicalData;
  rotation: RotationData;
  render: RenderData;
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
    requireNumbers(id, 'rotation', b.rotation, ['poleRaDeg', 'poleDecDeg', 'w0Deg', 'wDotDegPerDay']);
    if (!isObj(b.render) || typeof b.render.color !== 'string') fail(id, 'render.color must be a string');
    if (b.render.texture !== undefined && typeof b.render.texture !== 'string') fail(id, 'render.texture must be a string');
    if (b.render.minPixels !== undefined) requireNumbers(id, 'render', b.render, ['minPixels']);
    if (b.render.rings !== undefined) requireNumbers(id, 'render.rings', b.render.rings, ['innerKm', 'outerKm']);
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
