import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineLoop, Vector3 } from 'three';
import type { BodyRecord } from '../data/bodies';
import { orbitalPeriodDays, relativePosition } from '../ephemeris';
import { eclipticAuToScene } from '../scene/units';

export const ORBIT_SAMPLES = 360;

/**
 * Closed polyline of one full orbital period, sampled from the ephemeris (relative to the parent).
 * Sampling starts at the current time, so the body sits exactly on vertex 0; it is re-sampled once
 * the body has moved half a segment, keeping the line through the body as elements drift.
 * The owner positions `line` at the parent's centre each frame.
 */
export class OrbitLine {
  readonly line: LineLoop;
  readonly periodDays: number;
  private sampledJd = Number.NaN;
  private readonly positions: Float32Array;

  constructor(readonly record: BodyRecord & { orbit: NonNullable<BodyRecord['orbit']> }) {
    this.periodDays = orbitalPeriodDays(record.orbit);
    this.positions = new Float32Array(ORBIT_SAMPLES * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const color = new Color(record.render.color).lerp(new Color(0x000000), 0.45);
    this.line = new LineLoop(geometry, new LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    this.line.name = `${record.id}-orbit`;
    this.line.frustumCulled = false;
  }

  /** Re-sample if needed. Returns true if the geometry changed. */
  update(jd: number): boolean {
    if (Math.abs(jd - this.sampledJd) < this.periodDays / ORBIT_SAMPLES / 2) return false;
    this.sample(jd);
    return true;
  }

  private sample(jd: number): void {
    const v = new Vector3();
    for (let k = 0; k < ORBIT_SAMPLES; k++) {
      eclipticAuToScene(relativePosition(this.record, jd + (k / ORBIT_SAMPLES) * this.periodDays), v);
      this.positions.set([v.x, v.y, v.z], k * 3);
    }
    const geometry = this.line.geometry;
    geometry.attributes.position!.needsUpdate = true;
    geometry.computeBoundingSphere();
    this.sampledJd = jd;
  }
}
