import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import { worldUnitsPerPixel } from '../bodies/scaleMode';

/** Absolute closest the camera may get to a surface, km. */
export const MIN_ALTITUDE_KM = 0.1;
/**
 * Altitude floor as a fraction of the body's radius. A body is one mesh centred on the body, so its
 * surface position on the GPU is rounded to the float32 step at |centre − camera| ≈ R (≈ R·1.2e-7).
 * That rounding changes as the camera moves; at altitude h it shows as ≈ R·1.2e-7 / h rad of jitter.
 * Keeping h ≥ 2.5e-4·R holds it under ~0.5 px. (Earth: 1.6 km, Ganymede: 0.66 km, Phobos: 100 m.)
 * Going lower needs the sphere split into tiles with local origins (terrain LOD).
 */
export const MIN_ALTITUDE_PER_RADIUS = 2.5e-4;

export function minAltitudeKm(radiusKm: number): number {
  return Math.max(MIN_ALTITUDE_KM, radiusKm * MIN_ALTITUDE_PER_RADIUS);
}
/** Farthest it may get from the focus, km (~1,000 AU). */
export const MAX_DISTANCE_KM = 1.5e11;
const MAX_ELEVATION = MathUtils.degToRad(85);
const MAX_TILT = MathUtils.degToRad(85);
/** Wheel: altitude multiplies by exp(deltaY · this) — i.e. zoom is proportional to altitude. */
const WHEEL_ZOOM = 0.0015;
/** Fraction of the remaining gap closed per second (exponential smoothing). */
const SMOOTHING = 12;

/** Camera state relative to the focused body. All float64. Angles in radians. */
export interface OrbitState {
  /** around the focus, in the world X-Z plane */
  azimuth: number;
  /** above the world X-Z (ecliptic) plane */
  elevation: number;
  /** above the focus body's mean-radius sphere, km */
  altitude: number;
  /** view direction pitched from "straight at the centre" toward the horizon */
  tilt: number;
}

/** World position (km, float64) of the camera for a state around a focus. */
export function cameraWorldPosition(focusWorld: Vector3, focusRadiusKm: number, s: OrbitState, out = new Vector3()): Vector3 {
  const d = focusRadiusKm + s.altitude;
  const ce = Math.cos(s.elevation);
  return out.set(ce * Math.sin(s.azimuth), Math.sin(s.elevation), ce * Math.cos(s.azimuth)).multiplyScalar(d).add(focusWorld);
}

/** Camera orientation: look at the focus centre, Y up, then pitch up by `tilt`. */
export function cameraQuaternion(s: OrbitState, out = new Quaternion()): Quaternion {
  // Looking from the camera toward the centre = −offset direction. Build yaw/pitch directly to stay
  // well-conditioned (no lookAt singularity): yaw = azimuth, pitch = −elevation + tilt.
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), s.azimuth);
  const pitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -s.elevation + s.tilt);
  return out.copy(yaw).multiply(pitch);
}

/** Angle from straight down to the horizon: tilting further would point the view centre into space. */
export function horizonAngle(altitude: number, focusRadiusKm: number): number {
  return Math.asin(focusRadiusKm / (focusRadiusKm + altitude));
}

export function clampState(s: OrbitState, focusRadiusKm: number): OrbitState {
  const altitude = MathUtils.clamp(s.altitude, minAltitudeKm(focusRadiusKm), MAX_DISTANCE_KM - focusRadiusKm);
  return {
    azimuth: s.azimuth,
    elevation: MathUtils.clamp(s.elevation, -MAX_ELEVATION, MAX_ELEVATION),
    altitude,
    tilt: MathUtils.clamp(s.tilt, 0, Math.min(MAX_TILT, horizonAngle(altitude, focusRadiusKm))),
  };
}

/**
 * Radians of orbit per pixel of drag. Far away: a full-height drag ≈ half a turn. Near the surface:
 * the ground under the cursor moves with the cursor (arc length per px = ground size of a px).
 */
export function rotationPerPixel(altitude: number, focusRadiusKm: number, fovDeg: number, viewportHeightPx: number): number {
  const far = Math.PI / viewportHeightPx;
  const near = worldUnitsPerPixel(altitude, fovDeg, viewportHeightPx) / focusRadiusKm;
  return Math.min(far, near);
}

/**
 * Orbit/zoom/tilt camera around a focus body, with all state in float64 km/radians.
 * Drag: orbit. Wheel / pinch: zoom (altitude-proportional). Right-drag or Shift-drag: tilt toward horizon.
 * The Three.js camera itself never moves from (0,0,0); `worldPosition` is where it "is".
 */
export class CameraController {
  readonly worldPosition = new Vector3();
  /** current (smoothed) and target state */
  readonly state: OrbitState = { azimuth: 0.6, elevation: 0.7, altitude: 5e8, tilt: 0 };
  private target: OrbitState = { ...this.state };
  private focusRadiusKm = 1;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;

  constructor(private readonly dom: HTMLElement, private readonly camera: PerspectiveCamera) {
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Change focus. Keeps the viewing direction; frames the body at `altitudeRadii` radii above its surface. */
  setFocus(radiusKm: number, altitudeRadii = 2): void {
    this.focusRadiusKm = radiusKm;
    this.target = clampState({ ...this.target, altitude: radiusKm * altitudeRadii }, radiusKm);
    Object.assign(this.state, this.target); // jump, no smoothing across the solar system
  }

  /** Set the target state directly (e.g. from a test or URL); smoothing applies unless `immediate`. */
  setTarget(s: Partial<OrbitState>, immediate = false): void {
    this.target = clampState({ ...this.target, ...s }, this.focusRadiusKm);
    if (immediate) Object.assign(this.state, this.target);
  }

  /** Advance smoothing and place the camera. Returns the camera's world position (km). */
  update(dtSeconds: number, focusWorld: Vector3): Vector3 {
    const k = 1 - Math.exp(-SMOOTHING * Math.min(dtSeconds, 0.1));
    const s = this.state, t = this.target;
    s.azimuth += (t.azimuth - s.azimuth) * k;
    s.elevation += (t.elevation - s.elevation) * k;
    s.tilt += (t.tilt - s.tilt) * k;
    s.altitude = Math.exp(Math.log(s.altitude) + (Math.log(t.altitude) - Math.log(s.altitude)) * k); // log-space
    s.tilt = Math.min(s.tilt, horizonAngle(s.altitude, this.focusRadiusKm));
    cameraWorldPosition(focusWorld, this.focusRadiusKm, s, this.worldPosition);
    this.camera.position.set(0, 0, 0); // floating origin
    cameraQuaternion(s, this.camera.quaternion);
    this.camera.updateMatrixWorld();
    return this.worldPosition;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dom.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.pinchDistance = this.currentPinchDistance();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (this.pointers.size === 2) {
      const d = this.currentPinchDistance();
      if (this.pinchDistance > 0 && d > 0) this.zoomBy(this.pinchDistance / d);
      this.pinchDistance = d;
      return;
    }
    const h = this.dom.clientHeight || 1;
    if (e.shiftKey || (e.buttons & 2) !== 0) {
      this.setTarget({ tilt: this.target.tilt - (dy * Math.PI) / h }); // drag up = look toward the horizon
      return;
    }
    const perPx = rotationPerPixel(this.target.altitude, this.focusRadiusKm, this.camera.fov, h);
    this.setTarget({ azimuth: this.target.azimuth - dx * perPx, elevation: this.target.elevation + dy * perPx });
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinchDistance = this.pointers.size === 2 ? this.currentPinchDistance() : 0;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.zoomBy(Math.exp(e.deltaY * lines * WHEEL_ZOOM));
  };

  /** Multiply altitude by `factor` (> 1 = out). */
  zoomBy(factor: number): void {
    this.setTarget({ altitude: this.target.altitude * factor });
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
