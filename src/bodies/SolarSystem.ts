import { Group, PerspectiveCamera, PointLight, Vector3 } from 'three';
import type { BodyRecord } from '../data/bodies';
import { relativePosition } from '../ephemeris';
import { eclipticAuToScene } from '../scene/units';
import { Body } from './Body';
import { OrbitLine } from './OrbitLine';
import type { ScaleMode } from './scaleMode';
import type { TextureLoaderFn } from './textures';

/** Builds every body and orbit line from bodies.json and moves them for a given time. */
export class SolarSystem {
  readonly group = new Group();
  readonly bodies: Body[] = [];
  readonly orbits = new Map<string, OrbitLine>();
  readonly sunLight: PointLight;
  private readonly byId = new Map<string, Body>();
  private readonly tmp = new Vector3();

  constructor(records: readonly BodyRecord[], loadTexture: TextureLoaderFn) {
    // Parents before children, so positions can be accumulated in one pass.
    for (const r of sortParentsFirst(records)) {
      const body = new Body(r, loadTexture);
      this.bodies.push(body);
      this.byId.set(r.id, body);
      this.group.add(body.root);
      if (r.orbit) {
        const orbit = new OrbitLine({ ...r, orbit: r.orbit });
        this.orbits.set(r.id, orbit);
        this.group.add(orbit.line);
      }
    }
    // Sunlight: no distance falloff, so the outer planets stay visible (decay = 0).
    this.sunLight = new PointLight(0xffffff, 3, 0, 0);
    const star = this.bodies.find((b) => b.record.type === 'star');
    (star?.root ?? this.group).add(this.sunLight);
  }

  get(id: string): Body | undefined {
    return this.byId.get(id);
  }

  /** Position bodies and orbit lines for Julian Date `jd`. */
  setTime(jd: number): void {
    for (const body of this.bodies) {
      const parent = body.record.parent ? this.byId.get(body.record.parent) : undefined;
      eclipticAuToScene(relativePosition(body.record, jd), this.tmp);
      body.root.position.copy(this.tmp);
      if (parent) body.root.position.add(parent.root.position);
      body.setTime(jd);
      const orbit = this.orbits.get(body.record.id);
      if (orbit) {
        orbit.update(jd);
        if (parent) orbit.line.position.copy(parent.root.position);
      }
    }
  }

  /** Apply the scale mode (Explorer needs the camera to compute pixel sizes). */
  setScale(mode: ScaleMode, camera: PerspectiveCamera, viewportHeightPx: number): void {
    for (const body of this.bodies) {
      body.setScale(mode, camera.position.distanceTo(body.root.position), camera.fov, viewportHeightPx);
    }
  }
}

function sortParentsFirst(records: readonly BodyRecord[]): BodyRecord[] {
  const ids = new Map(records.map((r) => [r.id, r]));
  const depth = (r: BodyRecord): number => {
    let d = 0;
    for (let p = r.parent; p; p = ids.get(p)?.parent ?? null) d++;
    return d;
  };
  return [...records].sort((a, b) => depth(a) - depth(b));
}
