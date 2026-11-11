import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { worldUnitsPerPixel } from '../bodies/scaleMode';
import { Flight, quaternionFromYawPitch, yawPitchFromForward } from './flight';
import { rayThroughPixel, raySphere } from './picking';

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
/** Farthest the camera may get from the focus, km (~1,000 AU). */
export const MAX_DISTANCE_KM = 1.5e11;
/** Orbit stops this far from the poles (avoids flipping over the top). */
const MAX_ELEVATION = MathUtils.degToRad(85);
const MAX_PITCH = MathUtils.degToRad(89);
/** One wheel "line" ≈ 100 px of deltaY ≈ 14% of the altitude. */
const WHEEL_ZOOM = 0.0015;
/** Keyboard: zoom e-folds per second while +/- is held; orbit speed in screen-heights per second. */
const KEY_ZOOM_RATE = 1.4;
const KEY_ORBIT_SCREENS_PER_S = 0.5;
/** Exponential smoothing rate (1/s). */
const SMOOTHING = 14;
/** A press that moves less than this and lasts less than CLICK_MS is a click/tap. */
const CLICK_SLOP_PX = 5;
const CLICK_MS = 500;
const DOUBLE_CLICK_MS = 350;
const DOUBLE_CLICK_SLOP_PX = 24;

export function minAltitudeKm(radiusKm: number): number {
  return Math.max(MIN_ALTITUDE_KM, radiusKm * MIN_ALTITUDE_PER_RADIUS);
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

export interface FocusBody {
  id: string;
  world: Vector3;
  radiusKm: number;
}

export interface ControllerDeps {
  /** Every body the camera must stay outside of. */
  obstacles: () => Iterable<FocusBody>;
  /** World position (km) of a body `secondsAhead` of real time from now, at the current clock rate. */
  predictWorld: (id: string, secondsAhead: number) => Vector3;
}

export interface ControllerEvents {
  click?: (x: number, y: number, pointerType: string) => void;
  doubleClick?: (x: number, y: number, pointerType: string) => void;
  hover?: (x: number, y: number) => void;
  escape?: () => void;
  home?: () => void;
  enter?: () => void;
  /** a fly-to finished and the focus changed */
  arrived?: (focus: FocusBody) => void;
}

interface Pose {
  rel: Vector3; // camera − focus centre, km (float64)
  yaw: number;
  pitch: number;
}

/**
 * Map-style camera around a focus body. All state is float64 km/radians; the Three.js camera stays at
 * (0,0,0) (floating origin) and only takes the orientation.
 *
 * - Drag: orbit around the focus. Right-drag / Ctrl-drag / two fingers: pan. Shift-drag: tilt.
 * - Wheel / pinch: zoom toward the cursor; step ∝ altitude above the focus surface (log-scaled).
 * - Click/tap and double-click/tap are reported through `events`.
 * - Keys: arrows orbit, +/- zoom, Esc / Home / Enter reported through `events`.
 * - `flyTo`: van Wijk path to a (moving) body; any input interrupts it.
 */
export class CameraController {
  readonly worldPosition = new Vector3();
  focus: FocusBody;
  events: ControllerEvents = {};

  private readonly target: Pose = { rel: new Vector3(0, 0, 1), yaw: 0, pitch: 0 };
  private readonly current: Pose = { rel: new Vector3(0, 0, 1), yaw: 0, pitch: 0 };
  private flight: { flight: Flight; target: FocusBody; t: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private press: { x: number; y: number; t: number; moved: boolean; type: string } | null = null;
  private lastClick: { x: number; y: number; t: number } | null = null;
  private pinch: { dist: number; cx: number; cy: number } | null = null;
  private readonly keys = new Set<string>();

  constructor(
    private readonly dom: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly deps: ControllerDeps,
    initialFocus: FocusBody,
    keyTarget: Pick<Window, 'addEventListener'> | null = typeof window === 'undefined' ? null : window,
  ) {
    this.focus = initialFocus;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerCancel);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    keyTarget?.addEventListener('keydown', this.onKeyDown as EventListener);
    keyTarget?.addEventListener('keyup', this.onKeyUp as EventListener);
    keyTarget?.addEventListener('blur', () => this.keys.clear());
  }

  // ---------------------------------------------------------------- state

  get isFlying(): boolean {
    return this.flight !== null;
  }

  get flightTarget(): FocusBody | null {
    return this.flight?.target ?? null;
  }

  /** Current altitude above the focus body's mean sphere, km. */
  get altitude(): number {
    return this.current.rel.length() - this.focus.radiusKm;
  }

  /** Jump (no animation): focus `body`, looking at it from `direction` (world, unit) at `distanceKm`. */
  setView(body: FocusBody, direction: Vector3, distanceKm: number): void {
    this.flight = null;
    this.focus = body;
    const rel = direction.clone().normalize().multiplyScalar(distanceKm);
    const { yaw, pitch } = yawPitchFromForward(rel.clone().negate());
    for (const p of [this.target, this.current]) {
      p.rel.copy(rel);
      p.yaw = yaw;
      p.pitch = pitch;
    }
    this.clampPose(this.target);
    this.copyPose(this.target, this.current);
  }

  /** Fly to `body`. Arrives looking at it from `endDirection` (default: the current viewing direction). */
  flyTo(body: FocusBody, opts: { endDistanceKm?: number; endDirection?: Vector3 } = {}): Flight {
    const startCamera = this.focus.world.clone().add(this.current.rel);
    const focusAtStart = this.focus;
    const flight = new Flight({
      startCamera,
      startQuaternion: quaternionFromYawPitch(this.current.yaw, this.current.pitch),
      startAnchor: () => focusAtStart.world.clone(),
      targetAnchor: (ahead) => this.deps.predictWorld(body.id, ahead),
      endDirection: opts.endDirection,
      endDistance: opts.endDistanceKm ?? body.radiusKm * 4,
    });
    this.flight = { flight, target: body, t: 0 };
    return flight;
  }

  cancelFlight(): void {
    if (!this.flight) return;
    this.flight = null;
    // Keep the camera where it is; the focus only changes on arrival.
    this.copyPose(this.current, this.target);
  }

  // ---------------------------------------------------------------- per frame

  /** Advance input/flight and place the camera. Returns the camera's world position (km). */
  update(dtSeconds: number): Vector3 {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    if (this.flight) {
      this.flight.t += dt;
      const pose = this.flight.flight.pose(this.flight.t);
      this.worldPosition.copy(pose.position);
      if (pose.done) {
        this.focus = this.flight.target;
        this.flight = null;
      }
      this.current.rel.subVectors(this.worldPosition, this.focus.world);
      const fwd = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
      Object.assign(this.current, yawPitchFromForward(fwd));
      this.copyPose(this.current, this.target);
      if (!this.flight) this.events.arrived?.(this.focus);
    } else {
      this.applyHeldKeys(dt);
      const k = 1 - Math.exp(-SMOOTHING * dt);
      this.current.rel.lerp(this.target.rel, k);
      this.current.yaw += wrapAngle(this.target.yaw - this.current.yaw) * k;
      this.current.pitch += (this.target.pitch - this.current.pitch) * k;
      this.worldPosition.addVectors(this.focus.world, this.current.rel);
    }
    if (this.pushOutOfBodies()) {
      this.current.rel.subVectors(this.worldPosition, this.focus.world);
      if (!this.flight) this.target.rel.copy(this.current.rel);
    }
    this.camera.position.set(0, 0, 0); // floating origin
    quaternionFromYawPitch(this.current.yaw, this.current.pitch, this.camera.quaternion);
    this.camera.updateMatrixWorld();
    return this.worldPosition;
  }

  // ---------------------------------------------------------------- operations (act on the target pose)

  /** Orbit about the focus centre: the focus stays put on screen. dAzimuth/dElevation in radians. */
  orbit(dAzimuth: number, dElevation: number): void {
    const p = this.target;
    p.rel.applyAxisAngle(new Vector3(0, 1, 0), dAzimuth);
    p.yaw += dAzimuth;
    // Elevation: rotate about the camera's (horizontal) right axis, unless that passes a pole limit.
    const right = new Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const rel = p.rel.clone().applyAxisAngle(right, -dElevation);
    const elevation = Math.asin(rel.y / rel.length());
    const pitch = p.pitch - dElevation;
    if (Math.abs(elevation) <= MAX_ELEVATION && Math.abs(pitch) <= MAX_PITCH) {
      p.rel.copy(rel);
      p.pitch = pitch;
    }
  }

  /** Zoom along the ray through a screen point (CSS px); factor < 1 zooms in. Step ∝ altitude. */
  zoomAt(factor: number, xPx: number, yPx: number): void {
    const p = this.target;
    const dir = this.rayFor(p, xPx, yPx);
    const alt = Math.max(p.rel.length() - this.focus.radiusKm, minAltitudeKm(this.focus.radiusKm));
    // Moving by alt·(1 − f) along any ray can never reach the surface (it is ≥ alt away).
    p.rel.addScaledVector(dir, factor < 1 ? alt * (1 - factor) : -alt * (factor - 1));
    this.clampPose(p);
  }

  /** Pan by a screen delta (CSS px): the point under the cursor follows the cursor. */
  pan(dxPx: number, dyPx: number, xPx: number, yPx: number): void {
    const p = this.target;
    const h = this.viewport().h;
    const q = quaternionFromYawPitch(p.yaw, p.pitch);
    const ray = this.rayFor(p, xPx, yPx);
    const depth = raySphere(ray, p.rel.clone().negate(), this.focus.radiusKm) ?? p.rel.length();
    const k = worldUnitsPerPixel(depth, this.camera.fov, h);
    const right = new Vector3(1, 0, 0).applyQuaternion(q);
    const up = new Vector3(0, 1, 0).applyQuaternion(q);
    p.rel.addScaledVector(right, -dxPx * k).addScaledVector(up, dyPx * k);
    this.clampPose(p);
  }

  /** Pitch the view in place (positive = toward the horizon/up). */
  tilt(dRadians: number): void {
    this.target.pitch = MathUtils.clamp(this.target.pitch + dRadians, -MAX_PITCH, MAX_PITCH);
  }

  // ---------------------------------------------------------------- input

  private onPointerDown = (e: PointerEvent): void => {
    this.cancelFlight(); // any input interrupts a fly-to
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.press = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, type: e.pointerType };
    else this.press = null; // second finger: not a tap
    if (this.pointers.size === 2) this.pinch = this.pinchState();
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') this.events.hover?.(...this.local(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > CLICK_SLOP_PX) this.press.moved = true;
    if (this.press && !this.press.moved) return;

    if (this.pointers.size >= 2) {
      // Two fingers: pinch = zoom toward the midpoint, midpoint motion = pan.
      const now = this.pinchState();
      if (this.pinch && now.dist > 0) {
        const [x, y] = this.local(now.cx, now.cy);
        this.zoomAt(this.pinch.dist / now.dist, x, y);
        this.pan(now.cx - this.pinch.cx, now.cy - this.pinch.cy, x, y);
      }
      this.pinch = now;
      return;
    }
    const [x, y] = this.local(e.clientX, e.clientY);
    const h = this.viewport().h;
    if (e.shiftKey) this.tilt((-dy * Math.PI) / h);
    else if ((e.buttons & 2) !== 0 || (e.buttons & 4) !== 0 || e.ctrlKey || e.metaKey) this.pan(dx, dy, x, y);
    else {
      const perPx = rotationPerPixel(this.target.rel.length() - this.focus.radiusKm, this.focus.radiusKm, this.camera.fov, h);
      this.orbit(-dx * perPx, dy * perPx);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const press = this.press;
    this.pointers.delete(e.pointerId);
    this.pinch = this.pointers.size === 2 ? this.pinchState() : null;
    if (this.pointers.size === 0) this.press = null;
    if (!press || press.moved || performance.now() - press.t > CLICK_MS || e.button > 0) return;
    const [x, y] = this.local(e.clientX, e.clientY);
    const now = performance.now();
    const isDouble = this.lastClick && now - this.lastClick.t < DOUBLE_CLICK_MS &&
      Math.hypot(x - this.lastClick.x, y - this.lastClick.y) < DOUBLE_CLICK_SLOP_PX;
    if (isDouble) {
      this.lastClick = null;
      this.events.doubleClick?.(x, y, press.type);
    } else {
      this.lastClick = { x, y, t: now };
      this.events.click?.(x, y, press.type);
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.press = null;
    this.pinch = null;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.cancelFlight();
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1; // lines / pages → px
    const [x, y] = this.local(e.clientX, e.clientY);
    this.zoomAt(Math.exp(e.deltaY * unit * WHEEL_ZOOM), x, y);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'Escape': this.cancelFlight(); this.events.escape?.(); break;
      case 'Home': this.cancelFlight(); this.events.home?.(); break;
      case 'Enter': this.events.enter?.(); break;
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
      case '+': case '=': case '-': case '_':
        this.cancelFlight();
        this.keys.add(e.key === '=' ? '+' : e.key === '_' ? '-' : e.key);
        break;
      default: return;
    }
    e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key === '=' ? '+' : e.key === '_' ? '-' : e.key);
  };

  /** Continuous orbit/zoom while keys are held. */
  applyHeldKeys(dt: number): void {
    if (this.keys.size === 0) return;
    const { w, h } = this.viewport();
    const alt = this.target.rel.length() - this.focus.radiusKm;
    const step = rotationPerPixel(alt, this.focus.radiusKm, this.camera.fov, h) * KEY_ORBIT_SCREENS_PER_S * h * dt;
    const x = (this.keys.has('ArrowLeft') ? 1 : 0) - (this.keys.has('ArrowRight') ? 1 : 0);
    const y = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    if (x || y) this.orbit(x * step, y * step);
    const z = (this.keys.has('-') ? 1 : 0) - (this.keys.has('+') ? 1 : 0);
    if (z) this.zoomAt(Math.exp(z * KEY_ZOOM_RATE * dt), w / 2, h / 2);
  }

  // ---------------------------------------------------------------- helpers

  private rayFor(p: Pose, xPx: number, yPx: number): Vector3 {
    const { w, h } = this.viewport();
    const cam = this.camera.clone();
    cam.aspect = w / h;
    quaternionFromYawPitch(p.yaw, p.pitch, cam.quaternion);
    return rayThroughPixel(xPx, yPx, w, h, cam);
  }

  private clampPose(p: Pose): void {
    const r = this.focus.radiusKm;
    const d = p.rel.length();
    const min = r + minAltitudeKm(r);
    if (d < min) p.rel.multiplyScalar(min / d);
    else if (d > MAX_DISTANCE_KM) p.rel.multiplyScalar(MAX_DISTANCE_KM / d);
  }

  /** Keep the camera outside every body (not just the focus). Returns true if it moved. */
  private pushOutOfBodies(): boolean {
    let moved = false;
    for (const b of this.deps.obstacles()) {
      const off = this.worldPosition.clone().sub(b.world);
      const d = off.length();
      const min = b.radiusKm + minAltitudeKm(b.radiusKm);
      if (d < min) {
        this.worldPosition.copy(b.world).addScaledVector(d > 0 ? off.divideScalar(d) : new Vector3(0, 1, 0), min);
        moved = true;
      }
    }
    return moved;
  }

  private copyPose(from: Pose, to: Pose): void {
    to.rel.copy(from.rel);
    to.yaw = from.yaw;
    to.pitch = from.pitch;
  }

  private viewport(): { w: number; h: number } {
    return { w: this.dom.clientWidth || 1, h: this.dom.clientHeight || 1 };
  }

  private local(clientX: number, clientY: number): [number, number] {
    const r = this.dom.getBoundingClientRect?.();
    return r ? [clientX - r.left, clientY - r.top] : [clientX, clientY];
  }

  private pinchState(): { dist: number; cx: number; cy: number } {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return { dist: 0, cx: 0, cy: 0 };
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
}

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && typeof el.tagName === 'string' && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
