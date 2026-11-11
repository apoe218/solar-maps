import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineLoop, Vector3 } from 'three';
import type { BodyRecord } from '../data/bodies';
import { ellipsePoint, orbitEllipse, orbitalPeriodDays } from '../ephemeris';
import { eclipticAuToSceneDelta } from '../scene/units';

export const ORBIT_SAMPLES = 360;

/**
 * One full orbit drawn as a 360-point closed polyline, from the ephemeris' osculating ellipse at the
 * current time (sampled evenly in eccentric anomaly, starting at the body).
 *
 * Vertices are stored relative to the BODY, and the owner places the line at the body each frame.
 * Near the body — the only place you can see it up close — vertices are ≈ 0 and keep full float32
 * precision, and the line always passes exactly through the body. Re-sampling costs 1 Kepler solve +
 * 360 sin/cos, so it is cheap enough to do whenever time changes.
 */
export class OrbitLine {
  readonly line: LineLoop;
  readonly periodDays: number;
  private sampledJd = Number.NaN;
  private readonly positions: Float32Array;
  private readonly tmp = new Vector3();

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

  /** Re-sample for Julian Date `jd` if it changed. Returns true if the geometry changed. */
  update(jd: number): boolean {
    if (jd === this.sampledJd) return false;
    const el = orbitEllipse(this.record.orbit, jd);
    const here = ellipsePoint(el, el.E);
    for (let k = 0; k < ORBIT_SAMPLES; k++) {
      const p = ellipsePoint(el, el.E + (2 * Math.PI * k) / ORBIT_SAMPLES);
      eclipticAuToSceneDelta({ x: p.x - here.x, y: p.y - here.y, z: p.z - here.z }, this.tmp);
      this.positions[k * 3] = this.tmp.x;
      this.positions[k * 3 + 1] = this.tmp.y;
      this.positions[k * 3 + 2] = this.tmp.z;
    }
    this.line.geometry.attributes.position!.needsUpdate = true;
    this.sampledJd = jd;
    return true;
  }
}
