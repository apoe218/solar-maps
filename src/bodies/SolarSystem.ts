import { Group, PointLight, Vector3, type PerspectiveCamera } from 'three';
import type { BodyRecord } from '../data/bodies';
import { relativePosition } from '../ephemeris';
import { eclipticAuToWorldKm, worldToScene } from '../scene/units';
import { Body } from './Body';
import { OrbitLine } from './OrbitLine';
import type { ScaleMode } from './scaleMode';
import type { TextureLoaderFn } from './textures';

export interface RenderStats {
  /** body whose surface is closest to the camera, and the camera's altitude above it (km) */
  nearestId: string;
  nearestAltitudeKm: number;
  /** largest |coordinate| of any object root placed in the scene this frame (scene units) */
  maxSceneCoord: number;
}

/**
 * Builds every body and orbit line from bodies.json. `setTime` updates float64 world positions;
 * `render` places everything relative to the camera (floating origin).
 */
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

  /** World position (float64 km) of body `id` at Julian Date `jd`, without changing the scene. */
  predictWorld(id: string, jd: number, out = new Vector3()): Vector3 {
    out.set(0, 0, 0);
    for (let b = this.byId.get(id); b; b = b.record.parent ? this.byId.get(b.record.parent) : undefined) {
      out.add(eclipticAuToWorldKm(relativePosition(b.record, jd), this.tmp));
    }
    return out;
  }

  /** Update float64 world positions, spins and orbit lines for Julian Date `jd`. */
  setTime(jd: number): void {
    for (const body of this.bodies) {
      eclipticAuToWorldKm(relativePosition(body.record, jd), body.world);
      const parent = body.record.parent ? this.byId.get(body.record.parent) : undefined;
      if (parent) body.world.add(parent.world);
      body.setTime(jd);
      this.orbits.get(body.record.id)?.update(jd);
    }
  }

  /**
   * Floating origin: place every object at (world − cameraWorld) so the camera is at the origin,
   * and choose sphere / dot appearance. `camera` must already sit at (0,0,0).
   */
  render(cameraWorldKm: Vector3, camera: PerspectiveCamera, viewportHeightPx: number, mode: ScaleMode): RenderStats {
    const stats: RenderStats = { nearestId: '', nearestAltitudeKm: Infinity, maxSceneCoord: 0 };
    for (const body of this.bodies) {
      worldToScene(body.world, cameraWorldKm, body.root.position);
      const orbit = this.orbits.get(body.record.id);
      if (orbit) orbit.line.position.copy(body.root.position); // lines are stored relative to their body
      const distKm = this.tmp.subVectors(body.world, cameraWorldKm).length(); // float64
      body.updateAppearance(mode, distKm, camera.fov, viewportHeightPx);
      const altitude = distKm - body.radiusKm;
      if (altitude < stats.nearestAltitudeKm) {
        stats.nearestAltitudeKm = altitude;
        stats.nearestId = body.record.id;
      }
      const p = body.root.position;
      stats.maxSceneCoord = Math.max(stats.maxSceneCoord, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
    }
    return stats;
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
