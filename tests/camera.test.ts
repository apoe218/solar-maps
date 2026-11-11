import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  CameraController,
  MIN_ALTITUDE_KM,
  minAltitudeKm,
  rotationPerPixel,
  type ControllerEvents,
  type FocusBody,
} from '../src/nav/CameraController';
import {
  Flight,
  flightDuration,
  quaternionFromYawPitch,
  vanWijkPath,
  yawPitchFromForward,
} from '../src/nav/flight';
import { pickBody, rayThroughPixel, raySphere } from '../src/nav/picking';

// ------------------------------------------------------------------ fakes

const W = 1280, H = 800;
type Listener = (e: Record<string, unknown>) => void;
function fakeDom() {
  const listeners: Record<string, Listener> = {};
  const dom = {
    style: {}, clientWidth: W, clientHeight: H,
    addEventListener: (t: string, f: Listener) => (listeners[t] = f),
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  return { dom: dom as unknown as HTMLElement, listeners };
}
function fakeKeys() {
  const listeners: Record<string, Listener> = {};
  return { target: { addEventListener: (t: string, f: Listener) => (listeners[t] = f) } as unknown as Window, listeners };
}
const ptr = (o: Record<string, unknown>) => ({ pointerId: 1, pointerType: 'mouse', buttons: 1, button: 0, shiftKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, ...o });

function setup(bodies: FocusBody[] = [mars(), phobos()], focus = bodies[1]!) {
  const { dom, listeners } = fakeDom();
  const keys = fakeKeys();
  const camera = new PerspectiveCamera(50, W / H, 1e-3, 1e11);
  const c = new CameraController(dom, camera, {
    obstacles: () => bodies,
    predictWorld: (id) => bodies.find((b) => b.id === id)!.world.clone(),
  }, focus, keys.target);
  return { c, camera, listeners, keys: keys.listeners, bodies };
}
const mars = (): FocusBody => ({ id: 'mars', world: new Vector3(2.28e8, 0, 0), radiusKm: 3389.5 });
const phobos = (): FocusBody => ({ id: 'phobos', world: new Vector3(2.28e8 + 9376, 0, 0), radiusKm: 11.05 });
const settle = (c: CameraController, frames = 300) => { for (let i = 0; i < frames; i++) c.update(1 / 60); };

/** Screen position (px) of a world point for the controller's camera. */
function screenOf(c: CameraController, camera: PerspectiveCamera, world: Vector3) {
  const v = world.clone().sub(c.worldPosition).project(camera);
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
}
/** World point on the focus surface under a pixel (null if the ray misses). */
function surfaceUnder(c: CameraController, camera: PerspectiveCamera, x: number, y: number) {
  const dir = rayThroughPixel(x, y, W, H, camera);
  const t = raySphere(dir, c.focus.world.clone().sub(c.worldPosition), c.focus.radiusKm);
  return t === null ? null : c.worldPosition.clone().addScaledVector(dir, t);
}

// ------------------------------------------------------------------ fly-to path

describe('van Wijk zoom-and-pan path', () => {
  it('starts and ends at the requested views, zooming out in between', () => {
    const p = vanWijkPath(10, 20, 1000);
    expect(p.w(0)).toBeCloseTo(10, 9);
    expect(p.w(p.S)).toBeCloseTo(20, 6);
    expect(p.u(0)).toBeCloseTo(0, 9);
    expect(p.u(p.S)).toBeCloseTo(1000, 6);
    expect(p.w(p.S / 2)).toBeGreaterThan(200); // rises well above both ends to see both
  });

  it('works across 10 orders of magnitude (overview → 10 km above Phobos)', () => {
    const p = vanWijkPath(4.2e8, 44, 2.3e8);
    expect(p.w(p.S) / 44).toBeCloseTo(1, 6);
    expect(p.u(p.S) / 2.3e8).toBeCloseTo(1, 9);
    expect(Number.isFinite(p.S)).toBe(true);
  });

  it('pure zoom when the endpoints coincide', () => {
    const p = vanWijkPath(1e6, 10, 0);
    expect(p.u(p.S / 2)).toBe(0);
    expect(p.w(p.S)).toBeCloseTo(10, 6);
  });

  it('path length — and so duration — grows with log distance', () => {
    const S = (d: number) => vanWijkPath(1e4, 1e4, d).S;
    expect(S(1e8) - S(1e7)).toBeCloseTo(S(1e7) - S(1e6), 1); // equal steps per decade
    expect(flightDuration(S(1e6))).toBeLessThan(flightDuration(S(1e9)));
    expect(flightDuration(0)).toBe(0.8);
    expect(flightDuration(1000)).toBe(7);
  });
});

describe('Flight', () => {
  const sunAt = new Vector3();
  const earth = new Vector3(1.5e8, 0, 0);
  const mars = new Vector3(-2.2e8, 0, 0); // opposite side of the Sun
  const start = earth.clone().add(new Vector3(0, 0, 30000));

  it('starts at the camera and arrives at target + direction · distance, looking at it', () => {
    const f = new Flight({
      startCamera: start, startQuaternion: quaternionFromYawPitch(0, 0),
      startAnchor: () => earth.clone(), targetAnchor: () => mars.clone(), endDistance: 13600,
    });
    expect(f.pose(0).position.distanceTo(start)).toBeLessThan(1e-6);
    const end = f.pose(f.duration);
    expect(end.done).toBe(true);
    expect(end.position.distanceTo(mars.clone().add(new Vector3(0, 0, 13600)))).toBeLessThan(1e-6);
    const fwd = new Vector3(0, 0, -1).applyQuaternion(end.quaternion);
    expect(fwd.dot(mars.clone().sub(end.position).normalize())).toBeCloseTo(1, 9);
  });

  it('moves along a curve that clears the Sun between Earth and Mars at opposition', () => {
    const f = new Flight({
      startCamera: start, startQuaternion: quaternionFromYawPitch(0, 0),
      startAnchor: () => earth.clone(), targetAnchor: () => mars.clone(), endDistance: 13600,
    });
    let closest = Infinity;
    for (let i = 0; i <= 200; i++) closest = Math.min(closest, f.pose((i / 200) * f.duration).position.distanceTo(sunAt));
    expect(closest).toBeGreaterThan(5e7); // ≫ the Sun's 7e5 km radius
  });

  it('lands on a moving target at its predicted arrival position', () => {
    const v = new Vector3(0, 0, 30); // km per real second
    let now = 0;
    const at = (t: number) => mars.clone().addScaledVector(v, t);
    const f = new Flight({
      startCamera: start, startQuaternion: quaternionFromYawPitch(0, 0),
      startAnchor: () => earth.clone(), targetAnchor: (ahead) => at(now + ahead), endDistance: 13600,
    });
    now = f.duration; // simulate the clock reaching arrival
    const end = f.pose(f.duration);
    expect(end.position.distanceTo(at(now).add(new Vector3(0, 0, 13600)))).toBeLessThan(1e-6);
  });
});

describe('orientation helpers', () => {
  it.each([[0, 0], [1, -0.5], [-2.5, 1.2]])('yaw/pitch round-trip (%f, %f)', (yaw, pitch) => {
    const f = new Vector3(0, 0, -1).applyQuaternion(quaternionFromYawPitch(yaw, pitch));
    const r = yawPitchFromForward(f);
    expect(r.yaw).toBeCloseTo(yaw, 12);
    expect(r.pitch).toBeCloseTo(pitch, 12);
  });
});

// ------------------------------------------------------------------ controller

describe('CameraController', () => {
  const view = (c: CameraController, f: FocusBody, alt: number, az = 0.3, el = 0.2) =>
    c.setView(f, new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)), f.radiusKm + alt);

  it('orbit (drag) keeps the focus centre fixed on screen', () => {
    const { c, camera, listeners } = setup();
    view(c, c.focus, 30);
    c.update(0);
    const before = screenOf(c, camera, c.focus.world);
    listeners.pointerdown!(ptr({ clientX: 600, clientY: 400 }));
    listeners.pointermove!(ptr({ clientX: 700, clientY: 450 }));
    listeners.pointerup!(ptr({ clientX: 700, clientY: 450 }));
    settle(c);
    const after = screenOf(c, camera, c.focus.world);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  it('near the surface, the ground follows a drag (orbit)', () => {
    const { c, camera, listeners } = setup();
    view(c, c.focus, 2);
    c.update(0);
    const p = surfaceUnder(c, camera, 640, 400)!;
    listeners.pointerdown!(ptr({ clientX: 640, clientY: 400 }));
    listeners.pointermove!(ptr({ clientX: 660, clientY: 400 })); // 20 px right
    listeners.pointerup!(ptr({ clientX: 660, clientY: 400 }));
    settle(c);
    const s = screenOf(c, camera, p);
    expect(s.x - 640).toBeGreaterThan(5); // moved right with the cursor
    expect(Math.abs(s.y - 400)).toBeLessThan(3);
  });

  it('zoom toward the cursor keeps the point under the cursor fixed', () => {
    const { c, camera, listeners } = setup();
    view(c, c.focus, 30);
    c.update(0);
    const p = surfaceUnder(c, camera, 700, 450)!;
    listeners.wheel!({ deltaY: -100, deltaMode: 0, clientX: 700, clientY: 450, preventDefault() {} });
    settle(c);
    const s = screenOf(c, camera, p);
    expect(s.x).toBeCloseTo(700, 2);
    expect(s.y).toBeCloseTo(450, 2);
  });

  it('one scroll step changes the altitude by the same ratio at any scale', () => {
    const ratios = [];
    for (const alt of [5, 5e3, 5e8]) {
      const { c, listeners } = setup();
      view(c, c.focus, alt);
      c.update(0);
      const a0 = c.altitude;
      listeners.wheel!({ deltaY: -100, deltaMode: 0, clientX: W / 2, clientY: H / 2, preventDefault() {} });
      settle(c);
      ratios.push(c.altitude / a0);
    }
    expect(ratios[0]).toBeCloseTo(Math.exp(-0.15), 3);
    expect(ratios[1]).toBeCloseTo(ratios[0]!, 3);
    expect(ratios[2]).toBeCloseTo(ratios[0]!, 3);
  });

  it('pan (right-drag) moves the point under the cursor with the cursor', () => {
    const { c, camera, listeners } = setup();
    view(c, c.focus, 30);
    c.update(0);
    const p = surfaceUnder(c, camera, 640, 400)!;
    listeners.pointerdown!(ptr({ clientX: 640, clientY: 400, buttons: 2 }));
    listeners.pointermove!(ptr({ clientX: 680, clientY: 420, buttons: 2 }));
    listeners.pointerup!(ptr({ clientX: 680, clientY: 420, button: 2 }));
    settle(c);
    const s = screenOf(c, camera, p);
    expect(s.x).toBeCloseTo(680, -1); // within ~5 px (the surface is curved)
    expect(s.y).toBeCloseTo(420, -1);
  });

  it('two-finger pinch zooms and two-finger drag pans', () => {
    const { c, listeners } = setup();
    view(c, c.focus, 30);
    c.update(0);
    const a0 = c.altitude;
    const t = (id: number, x: number, y: number) => ptr({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y });
    listeners.pointerdown!(t(1, 540, 400));
    listeners.pointerdown!(t(2, 740, 400));
    listeners.pointermove!(t(1, 440, 400)); // spread: 200 → 300 px
    listeners.pointermove!(t(2, 840, 400)); // 300 → 400 px
    listeners.pointerup!(t(1, 440, 400));
    listeners.pointerup!(t(2, 840, 400));
    settle(c);
    expect(c.altitude / a0).toBeLessThan(0.6);
  });

  it('click and double-click are told apart from drags', () => {
    const { c, listeners } = setup();
    const got: string[] = [];
    c.events = { click: () => got.push('click'), doubleClick: () => got.push('double') } satisfies ControllerEvents;
    const tap = (x: number) => {
      listeners.pointerdown!(ptr({ clientX: x, clientY: 300 }));
      listeners.pointerup!(ptr({ clientX: x, clientY: 300 }));
    };
    tap(500);
    tap(502); // quickly, close by → double
    listeners.pointerdown!(ptr({ clientX: 100, clientY: 100 }));
    listeners.pointermove!(ptr({ clientX: 160, clientY: 100 }));
    listeners.pointerup!(ptr({ clientX: 160, clientY: 100 })); // a drag: neither
    expect(got).toEqual(['click', 'double']);
  });

  it('never goes below the altitude floor, and stays outside other bodies', () => {
    const { c, bodies } = setup();
    view(c, c.focus, 1);
    for (let i = 0; i < 100; i++) c.zoomAt(0.5, W / 2, H / 2);
    settle(c);
    expect(c.altitude).toBeCloseTo(MIN_ALTITUDE_KM, 6);
    // Zoom out from Phobos toward Mars (Mars is in the −x direction from Phobos).
    c.setView(c.focus, new Vector3(-1, 0, 0), 2000);
    settle(c, 10);
    const toMars = c.worldPosition.distanceTo(bodies[0]!.world);
    expect(toMars).toBeGreaterThanOrEqual(3389.5 + minAltitudeKm(3389.5) - 1e-6);
  });

  it('arrow keys orbit; +/- zoom', () => {
    const { c, camera, keys } = setup();
    view(c, c.focus, 30);
    c.update(0);
    const before = c.worldPosition.clone();
    keys.keydown!({ key: 'ArrowLeft', target: null, preventDefault() {} });
    settle(c, 30);
    keys.keyup!({ key: 'ArrowLeft' });
    expect(c.worldPosition.distanceTo(before)).toBeGreaterThan(1);
    expect(c.altitude).toBeCloseTo(30, 0);
    const a0 = c.altitude;
    keys.keydown!({ key: '+', target: null, preventDefault() {} });
    settle(c, 30);
    keys.keyup!({ key: '+' });
    expect(c.altitude).toBeLessThan(a0 * 0.8);
    expect(camera.position.length()).toBe(0);
  });

  it('keys are ignored while typing in a form field', () => {
    const { c, keys } = setup();
    let escaped = false;
    c.events = { escape: () => (escaped = true) };
    keys.keydown!({ key: 'Escape', target: { tagName: 'SELECT' }, preventDefault() {} });
    expect(escaped).toBe(false);
    keys.keydown!({ key: 'Escape', target: null, preventDefault() {} });
    expect(escaped).toBe(true);
  });

  it('fly-to arrives at ~3 radii above the target and changes focus only at the end', () => {
    const { c, bodies } = setup();
    view(c, bodies[0]!, 20000); // looking at Mars
    let arrived: string | null = null;
    c.events = { arrived: (f) => (arrived = f.id) };
    const f = c.flyTo(bodies[1]!);
    for (let t = 0; t < f.duration - 0.05; t += 1 / 60) c.update(1 / 60);
    expect(c.focus.id).toBe('mars');
    expect(arrived).toBe(null);
    for (let i = 0; i < 10; i++) c.update(1 / 60);
    expect(c.focus.id).toBe('phobos');
    expect(arrived).toBe('phobos');
    expect(c.altitude).toBeCloseTo(3 * 11.05, 6);
  });

  it('any input interrupts a fly-to; the focus stays put', () => {
    const { c, listeners, bodies } = setup();
    view(c, bodies[0]!, 20000);
    c.flyTo(bodies[1]!);
    for (let i = 0; i < 10; i++) c.update(1 / 60);
    listeners.wheel!({ deltaY: 100, deltaMode: 0, clientX: 600, clientY: 400, preventDefault() {} });
    expect(c.isFlying).toBe(false);
    expect(c.focus.id).toBe('mars');
    const here = c.worldPosition.clone();
    c.update(0);
    expect(c.worldPosition.distanceTo(here)).toBeLessThan(1e-6); // no jump on interrupt
  });

  it('drag speed: ground follows the cursor near the surface, half a turn per screen far away', () => {
    const near = rotationPerPixel(10, 6371, 50, 800);
    expect(near * 6371).toBeCloseTo((2 * 10 * Math.tan((25 * Math.PI) / 180)) / 800, 9);
    expect(rotationPerPixel(1e9, 6371, 50, 800)).toBeCloseTo(Math.PI / 800, 12);
  });

  it('allows 10 km above any moon (largest: Ganymede, 2,634 km)', () => {
    expect(minAltitudeKm(2634)).toBeLessThan(10);
    expect(minAltitudeKm(11.05)).toBe(0.1);
    expect(minAltitudeKm(6371)).toBeCloseTo(1.59275, 9);
  });
});

// ------------------------------------------------------------------ picking

describe('picking', () => {
  const camera = new PerspectiveCamera(50, W / H, 1e-3, 1e11);
  camera.updateMatrixWorld();
  const at = (x: number, y: number, z: number) => new Vector3(x, y, z);

  it('hits a disc, prefers the front-most exact hit, then the nearest within tolerance', () => {
    const items = [
      { id: 'far', scenePosition: at(0, 0, -1000), screenRadiusPx: 40, visible: true, resolved: true, importance: 1 },
      { id: 'near', scenePosition: at(0, 0, -100), screenRadiusPx: 10, visible: true, resolved: true, importance: 1 },
      { id: 'dot', scenePosition: at(30, 0, -1000), screenRadiusPx: 3, visible: true, resolved: false, importance: 1 },
    ];
    expect(pickBody(items, W / 2, H / 2, camera, W, H, 8)).toBe('near');
    expect(pickBody(items, W / 2 + 30, H / 2, camera, W, H, 8)).toBe('far'); // inside far's disc only
    const dotX = W / 2 + (30 / 1000) / Math.tan((25 * Math.PI) / 180) * (H / 2);
    expect(pickBody(items.slice(2), dotX + 9, H / 2, camera, W, H, 8)).toBe('dot'); // 6 px off a 3 px dot
    expect(pickBody(items.slice(2), dotX + 20, H / 2, camera, W, H, 8)).toBe(null);
  });

  it('ignores hidden bodies and bodies behind the camera', () => {
    const items = [
      { id: 'behind', scenePosition: at(0, 0, 100), screenRadiusPx: 50, visible: true, resolved: true, importance: 1 },
      { id: 'hidden', scenePosition: at(0, 0, -100), screenRadiusPx: 50, visible: false, resolved: true, importance: 1 },
    ];
    expect(pickBody(items, W / 2, H / 2, camera, W, H, 8)).toBe(null);
  });

  it('overlapping markers: the planet wins over its moon (Earth/Moon dots at solar-system scale)', () => {
    const items = [
      { id: 'moon', scenePosition: at(0, 0, -1.495e8), screenRadiusPx: 3, visible: true, resolved: false, importance: 1737 },
      { id: 'earth', scenePosition: at(0, 0, -1.496e8), screenRadiusPx: 3, visible: true, resolved: false, importance: 6371 },
    ];
    expect(pickBody(items, W / 2, H / 2, camera, W, H, 8)).toBe('earth');
    expect(pickBody(items, W / 2 + 6, H / 2, camera, W, H, 8)).toBe('earth'); // tolerance tie
  });

  it('a moon marker in front of a resolved planet is still pickable', () => {
    const items = [
      { id: 'moon', scenePosition: at(0, 0, -5e4), screenRadiusPx: 3, visible: true, resolved: false, importance: 1737 },
      { id: 'earth', scenePosition: at(0, 0, -4e5), screenRadiusPx: 200, visible: true, resolved: true, importance: 6371 },
    ];
    expect(pickBody(items, W / 2, H / 2, camera, W, H, 8)).toBe('moon');
  });
});
