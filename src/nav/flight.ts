import { Quaternion, Vector3 } from 'three';

/**
 * Optimal pan-and-zoom path (J. J. van Wijk & W. A. A. Nuij, "Smooth and efficient zooming and panning",
 * IEEE InfoVis 2003). A view is a centre u on the line between two points and a width w; the path zooms
 * out, travels and zooms in so that perceived motion is uniform. Its length S is in log units, so
 * flights between very different scales take time proportional to log distance.
 *
 *   u(s): centre travelled along the line (0 → u1), w(s): view width (w0 → w1), s ∈ [0, S].
 */
export interface ZoomPath {
  S: number;
  u(s: number): number;
  w(s: number): number;
}

/** ρ: trade-off between zooming and panning; √2 is the paper's recommended value. */
export const RHO = Math.SQRT2;

export function vanWijkPath(w0: number, w1: number, u1: number, rho = RHO): ZoomPath {
  if (!(w0 > 0 && w1 > 0)) throw new RangeError('vanWijkPath: widths must be positive');
  // Pure zoom when the endpoints coincide (to within a tiny fraction of the view).
  if (u1 < 1e-9 * Math.max(w0, w1)) {
    const k = w1 < w0 ? -1 : 1;
    return { S: Math.abs(Math.log(w1 / w0)) / rho, u: () => 0, w: (s) => w0 * Math.exp(k * rho * s) };
  }
  const rho2 = rho * rho;
  const b = (wi: number, sign: 1 | -1) => (w1 * w1 - w0 * w0 + sign * rho2 * rho2 * u1 * u1) / (2 * wi * rho2 * u1);
  // r = ln(−b + √(b² + 1)) = −asinh(b), written with asinh to avoid cancellation for large b.
  const r0 = -Math.asinh(b(w0, 1));
  const r1 = -Math.asinh(b(w1, -1));
  const c0 = Math.cosh(r0), s0 = Math.sinh(r0);
  return {
    S: (r1 - r0) / rho,
    u: (s) => (w0 / rho2) * (c0 * Math.tanh(rho * s + r0) - s0),
    w: (s) => (w0 * c0) / Math.cosh(rho * s + r0),
  };
}

/** Flight duration (s) for a path of log-length S: grows with log distance, clamped to stay snappy. */
export function flightDuration(S: number): number {
  return Math.min(7, Math.max(0.8, 0.6 + 0.32 * S));
}

/** Smooth start and stop. */
export const easeInOut = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

/** Orientation without roll: yaw about world +Y, then pitch about the camera's right axis. */
export function quaternionFromYawPitch(yaw: number, pitch: number, out = new Quaternion()): Quaternion {
  const qy = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const qx = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch);
  return out.copy(qy).multiply(qx);
}

/** Inverse of the above for a forward (view) direction. */
export function yawPitchFromForward(f: Vector3): { yaw: number; pitch: number } {
  const n = f.clone().normalize();
  return { yaw: Math.atan2(-n.x, -n.z), pitch: Math.asin(Math.max(-1, Math.min(1, n.y))) };
}

/** Spherical interpolation between unit vectors (falls back to lerp when nearly parallel). */
export function slerpDirection(a: Vector3, b: Vector3, t: number, out = new Vector3()): Vector3 {
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  const theta = Math.acos(dot);
  if (theta < 1e-6) return out.copy(a).lerp(b, t).normalize();
  if (Math.PI - theta < 1e-6) {
    // Opposite: rotate through any perpendicular axis.
    const axis = new Vector3(0, 1, 0).cross(a);
    if (axis.lengthSq() < 1e-12) axis.set(1, 0, 0).cross(a);
    return out.copy(a).applyAxisAngle(axis.normalize(), theta * t);
  }
  const s = Math.sin(theta);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * theta) / s).addScaledVector(b, Math.sin(t * theta) / s);
}

export interface FlightSpec {
  /** camera world position (km) and orientation at the start */
  startCamera: Vector3;
  startQuaternion: Quaternion;
  /** live position of the start pivot (the body we leave), km */
  startAnchor: () => Vector3;
  /** predicted position of the destination `secondsAhead` from now, km (bodies keep moving) */
  targetAnchor: (secondsAhead: number) => Vector3;
  /** arrival: camera at target + endDirection·endDistance, looking at the target */
  endDirection?: Vector3;
  endDistance: number;
}

export interface FlightPose {
  position: Vector3;
  quaternion: Quaternion;
  done: boolean;
}

/**
 * A fly-to: the van Wijk path between the start pivot and the destination, with the view direction
 * turning from the start offset to the arrival offset. Both anchors are re-evaluated every frame (the
 * destination at its predicted arrival position), so the camera lands exactly on a moving body.
 */
export class Flight {
  readonly duration: number;
  readonly path: ZoomPath;
  private readonly u1: number;
  private readonly d0: Vector3;
  private readonly d1: Vector3;
  private readonly orientBlend = 0.3; // fraction of the flight spent turning from the user's view

  constructor(private readonly spec: FlightSpec) {
    const a = spec.startAnchor();
    const offset = spec.startCamera.clone().sub(a);
    const w0 = Math.max(offset.length(), 1e-6);
    this.d0 = offset.clone().divideScalar(w0);
    this.d1 = (spec.endDirection ?? this.d0).clone().normalize();
    // Arrival time depends on path length, which depends on where the target will be: iterate twice.
    let duration = 2;
    let path = vanWijkPath(w0, spec.endDistance, spec.targetAnchor(duration).distanceTo(a));
    for (let i = 0; i < 2; i++) {
      duration = flightDuration(path.S);
      path = vanWijkPath(w0, spec.endDistance, spec.targetAnchor(duration).distanceTo(a));
    }
    this.path = path;
    this.duration = flightDuration(path.S);
    this.u1 = spec.targetAnchor(this.duration).distanceTo(a);
  }

  /** Camera pose `t` seconds into the flight. */
  pose(t: number, out: FlightPose = { position: new Vector3(), quaternion: new Quaternion(), done: false }): FlightPose {
    const x = Math.min(1, t / this.duration);
    const e = easeInOut(x);
    const s = this.path.S * e;
    const a = this.spec.startAnchor();
    const b = this.spec.targetAnchor(Math.max(0, this.duration - t));
    const weight = this.u1 > 0 ? Math.min(1, Math.max(0, this.path.u(s) / this.u1)) : 1;
    const centre = a.clone().lerp(b, x >= 1 ? 1 : weight);
    const dir = slerpDirection(this.d0, this.d1, e);
    const w = x >= 1 ? this.spec.endDistance : this.path.w(s);
    out.position.copy(centre).addScaledVector(dir, w);
    const { yaw, pitch } = yawPitchFromForward(dir.clone().negate());
    const look = quaternionFromYawPitch(yaw, pitch);
    out.quaternion.copy(this.spec.startQuaternion).slerp(look, easeInOut(x / this.orientBlend));
    out.done = x >= 1;
    return out;
  }
}
