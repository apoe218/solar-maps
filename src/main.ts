import { TextureLoader, Vector3 } from 'three';
import type { Body } from './bodies/Body';
import { SolarSystem } from './bodies/SolarSystem';
import type { ScaleMode } from './bodies/scaleMode';
import type { TextureLoaderFn } from './bodies/textures';
import { BODIES } from './data/bodies';
import { CameraController } from './nav/CameraController';
import { PICK_TOLERANCE_PX, pickBody } from './nav/picking';
import { createScene } from './scene/scene';
import { SimClock } from './ui/clock';
import { mountDebugOverlay } from './ui/debugOverlay';
import { mountFocusSelect } from './ui/focusSelect';
import { mountScaleToggle } from './ui/scaleToggle';
import { mountSelectionLabel } from './ui/selectionLabel';
import { SelectionRing } from './ui/selectionRing';
import { mountTimeControls } from './ui/timeControls';
import './style.css';

const container = document.getElementById('app');
const ui = document.getElementById('ui');
if (!container || !ui) throw new Error('#app / #ui missing');

const params = new URLSearchParams(location.search);
const { renderer, scene, camera } = createScene(container);
const canvas = renderer.domElement;

const loader = new TextureLoader();
const loadTexture: TextureLoaderFn = (path, onError) =>
  loader.load(import.meta.env.BASE_URL + path, undefined, undefined, () => {
    console.warn(`Texture missing: ${path} — using flat colour`);
    onError();
  });

const system = new SolarSystem(BODIES, loadTexture);
scene.add(system.group);
const clock = new SimClock();
system.setTime(clock.jd);

const sun = system.get('sun')!;
const asFocus = (b: Body) => ({ id: b.record.id, world: b.world, radiusKm: b.radiusKm });
const obstacles = system.bodies.map(asFocus);

const controller = new CameraController(canvas, camera, {
  obstacles: () => obstacles,
  // Where a body will be after `secondsAhead` of real time at the current clock speed and direction.
  predictWorld: (id, secondsAhead) =>
    system.predictWorld(id, clock.jd + (clock.playing ? (clock.direction * clock.speed.rate * secondsAhead) / 86400 : 0)),
}, asFocus(sun));

/** The solar-system overview: from 40° above the ecliptic, 2.8 AU from the Sun on a 16:10 screen. */
const OVERVIEW_DIRECTION = new Vector3(Math.cos(0.7) * Math.sin(0.6), Math.sin(0.7), Math.cos(0.7) * Math.cos(0.6));
/** Back off on narrow (portrait) screens so the same width of the solar system fits. */
function overviewDistanceKm(): number {
  const halfV = Math.tan((camera.fov * Math.PI) / 360);
  return 4.2e8 * Math.max(1, (halfV * 1.6) / (halfV * Math.max(camera.aspect, 0.1)));
}
controller.setView(asFocus(sun), OVERVIEW_DIRECTION, overviewDistanceKm());

const marker = new SelectionRing(ui);

let scaleMode: ScaleMode = 'explorer';
const updateTimeUi = mountTimeControls(ui, clock);
mountScaleToggle(ui, scaleMode, (m) => (scaleMode = m));
const focusSelect = mountFocusSelect(ui, BODIES, 'sun', (id) => flyTo(system.get(id)!));
const selectionLabel = mountSelectionLabel(ui, () => marker.selected && flyTo(marker.selected));
const debug = mountDebugOverlay(ui, params.has('debug'));

function select(body: Body | null): void {
  marker.select(body);
  selectionLabel.show(body?.record.name ?? null, body?.record.id === controller.focus.id && !controller.isFlying);
}

/**
 * Fly to a body. Arrive between the current viewing direction and the Sun's direction, so the lit side
 * is in view (about a 45° phase) rather than whatever side we happened to come from.
 */
function flyTo(body: Body): void {
  select(body);
  let endDirection: Vector3 | undefined;
  if (body !== sun) {
    const from = controller.worldPosition.clone().sub(body.world).normalize();
    const toSun = sun.world.clone().sub(body.world).normalize();
    endDirection = from.lerp(toSun, 0.6);
    if (endDirection.lengthSq() < 1e-6) endDirection = toSun;
  }
  controller.flyTo(asFocus(body), { endDirection });
  selectionLabel.show(body.record.name, true);
}

function pickAt(x: number, y: number, pointerType: string): Body | null {
  const id = pickBody(
    system.bodies.map((b) => ({
      id: b.record.id,
      scenePosition: b.root.position,
      screenRadiusPx: b.screenRadiusPx,
      visible: b.root.visible,
      resolved: !b.isDot && b.tilt.scale.x === 1,
      importance: b.radiusKm,
    })),
    x, y, camera, canvas.clientWidth, canvas.clientHeight,
    pointerType === 'touch' ? PICK_TOLERANCE_PX.touch : PICK_TOLERANCE_PX.mouse,
  );
  return id ? system.get(id)! : null;
}

controller.events = {
  click: (x, y, type) => select(pickAt(x, y, type)),
  doubleClick: (x, y, type) => {
    const body = pickAt(x, y, type);
    if (body) flyTo(body);
  },
  hover: (x, y) => canvas.classList.toggle('hovering', pickAt(x, y, 'mouse') !== null),
  escape: () => {
    select(null);
    controller.flyTo(asFocus(sun), { endDistanceKm: overviewDistanceKm(), endDirection: OVERVIEW_DIRECTION });
  },
  home: () => flyTo(sun),
  enter: () => marker.selected && flyTo(marker.selected),
  arrived: (focus) => {
    focusSelect.set(focus.id);
    selectionLabel.show(marker.selected?.record.name ?? null, marker.selected?.record.id === focus.id);
  },
};

let last = performance.now();
let fps = 60;
renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  clock.tick(dt);
  system.setTime(clock.jd); // float64 world positions
  const cameraWorld = controller.update(dt); // float64; Three camera stays at (0,0,0)
  const stats = system.render(cameraWorld, camera, canvas.clientHeight, scaleMode);
  marker.update(camera, canvas);

  updateTimeUi();
  const focus = system.get(controller.focus.id)!;
  debug.update({
    fps,
    focusName: focus.record.name + (controller.isFlying ? `  → flying to ${controller.flightTarget!.id}` : ''),
    focusAltitudeKm: controller.altitude,
    focusAppearance: focus.isDot ? 'dot' : focus.tilt.scale.x > 1 ? 'enlarged' : 'sphere',
    nearestName: system.get(stats.nearestId)?.record.name ?? '—',
    nearestAltitudeKm: stats.nearestAltitudeKm,
    cameraWorldKm: cameraWorld.length(),
    focusSceneCoord: focus.root.position.length(),
    maxSceneCoord: stats.maxSceneCoord,
  });
  renderer.render(scene, camera);
});

// Test/debug handle (?debug): lets automated checks drive the camera and read the scene.
if (params.has('debug')) Object.assign(window, { __orrery: { system, controller, clock, camera, renderer, scene, marker } });
