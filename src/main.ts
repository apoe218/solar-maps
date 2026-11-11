import { TextureLoader, Vector3 } from 'three';
import type { Body } from './bodies/Body';
import { SolarSystem } from './bodies/SolarSystem';
import type { ScaleMode } from './bodies/scaleMode';
import type { TextureLoaderFn } from './bodies/textures';
import { BODIES } from './data/bodies';
import { CameraController } from './nav/CameraController';
import { PICK_TOLERANCE_PX, pickBody } from './nav/picking';
import { formatHash, parseHash, type ViewState } from './nav/urlState';
import { createScene } from './scene/scene';
import { mountAnnouncer } from './ui/announcer';
import { SimClock } from './ui/clock';
import { mountCopyLink } from './ui/copyLink';
import { mountDebugOverlay } from './ui/debugOverlay';
import { typeLabel } from './ui/format';
import { mountInfoPanel } from './ui/infoPanel';
import { LabelLayer } from './ui/labels';
import { mountScaleToggle } from './ui/scaleToggle';
import { mountSearch } from './ui/search';
import { SelectionRing } from './ui/selectionRing';
import { mountTimeControls } from './ui/timeControls';
import './style.css';

const container = document.getElementById('app');
const ui = document.getElementById('ui');
if (!container || !ui) throw new Error('#app / #ui missing');

const params = new URLSearchParams(location.search);
const { renderer, scene, camera } = createScene(container);
const canvas = renderer.domElement;
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', '3D map of the Solar System. Use the search box, or arrow keys to orbit and plus or minus to zoom.');

const loader = new TextureLoader();
const loadTexture: TextureLoaderFn = (path, onError) =>
  loader.load(import.meta.env.BASE_URL + path, undefined, undefined, () => {
    console.warn(`Texture missing: ${path} — using flat colour`);
    onError();
  });

const system = new SolarSystem(BODIES, loadTexture);
scene.add(system.group);

// ------------------------------------------------------------------ restore state from the URL
const initial = parseHash(location.hash);
const clock = new SimClock(initial.time ?? new Date());
system.setTime(clock.jd);

const sun = system.get('sun')!;
const earth = system.get('earth')!;
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
  return 4.2e8 * Math.max(1, 1.6 / Math.max(camera.aspect, 0.1));
}
const dirFromAzEl = (azDeg: number, elDeg: number) => {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
};
/** Default viewing direction for a body: between "above the ecliptic" and the Sun, so the lit side shows. */
function defaultDirection(b: Body): Vector3 {
  if (b === sun) return OVERVIEW_DIRECTION.clone();
  return sun.world.clone().sub(b.world).normalize().lerp(new Vector3(0, 1, 0), 0.35).normalize();
}

/** prefers-reduced-motion: fly-to jumps instead of animating. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function applyViewState(s: Partial<ViewState>, animate: boolean): void {
  if (s.time) clock.jd = new SimClock(s.time).jd;
  system.setTime(clock.jd);
  const body = s.body ? system.get(s.body) : undefined;
  if (!body) {
    if (!animate) controller.setView(asFocus(sun), OVERVIEW_DIRECTION, overviewDistanceKm());
    return;
  }
  const dir = s.view ? dirFromAzEl(s.view.azimuthDeg, s.view.elevationDeg) : defaultDirection(body);
  const dist = s.distKm ?? body.radiusKm * 4;
  if (animate) controller.flyTo(asFocus(body), { endDistanceKm: dist, endDirection: dir, instant: reducedMotion.matches });
  else controller.setView(asFocus(body), dir, dist);
}
applyViewState(initial, false);

// ------------------------------------------------------------------ UI
const announce = mountAnnouncer(ui);
const ring = new SelectionRing(ui);
let selected: Body | null = null;
let scaleMode: ScaleMode = 'explorer';

const RANK: Record<string, number> = { star: 0, planet: 1, 'dwarf-planet': 2, moon: 3 };
const describe = (id: string) => {
  const r = system.get(id)!.record;
  return typeLabel(r.type, r.parent ? system.get(r.parent)?.record.name ?? null : null);
};
mountSearch(ui, {
  entries: system.bodies.map((b) => ({ id: b.record.id, name: b.record.name, aliases: b.record.aliases, rank: RANK[b.record.type] ?? 4 })),
  describe,
  onChoose: (id) => flyTo(system.get(id)!),
  announce,
});

const toolbar = document.createElement('section');
toolbar.className = 'panel toolbar';
toolbar.setAttribute('aria-label', 'View options');
ui.appendChild(toolbar);
mountCopyLink(toolbar, announce, () => writeUrl(true));
mountScaleToggle(toolbar, scaleMode, (m) => {
  scaleMode = m;
  announce(m === 'true' ? 'True scale' : 'Explorer scale');
});

const narrow = window.matchMedia('(max-width: 600px)').matches;
const info = mountInfoPanel(ui, {
  get: (id) => system.get(id),
  earth,
  sun,
  isFocus: (b) => b.record.id === controller.focus.id && !controller.isFlying,
  onFly: (b) => flyTo(b),
}, narrow);

const updateTimeUi = mountTimeControls(ui, clock);
const debug = mountDebugOverlay(ui, params.has('debug'));

const labels = new LabelLayer(container, system.bodies, { select: (b) => select(b), fly: (b) => flyTo(b) });
labels.setSize(container.clientWidth, container.clientHeight);
window.addEventListener('resize', () => labels.setSize(container.clientWidth, container.clientHeight));

const focusBody = () => system.get(controller.focus.id)!;
info.show(focusBody());

function select(body: Body | null): void {
  selected = body;
  ring.select(body);
  info.show(body ?? focusBody());
  if (body) announce(`${body.record.name} selected. Press Enter to fly there.`);
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
  controller.flyTo(asFocus(body), { endDirection, instant: reducedMotion.matches });
  if (!reducedMotion.matches) announce(`Flying to ${body.record.name}`);
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
    controller.flyTo(asFocus(sun), { endDistanceKm: overviewDistanceKm(), endDirection: OVERVIEW_DIRECTION, instant: reducedMotion.matches });
    announce('Returning to the solar system view');
  },
  home: () => flyTo(sun),
  enter: () => selected && flyTo(selected),
  arrived: (focus) => {
    info.show(selected ?? focusBody());
    announce(`Arrived at ${system.get(focus.id)!.record.name}`);
    writeUrl(true);
  },
};

// ------------------------------------------------------------------ URL sync
/** The clock is "live" when it follows real time; then the URL omits t so a shared link shows "now". */
function clockIsLive(): boolean {
  return clock.playing && clock.direction === 1 && clock.speed.id === 'realtime' && Math.abs(clock.date.getTime() - Date.now()) < 120_000;
}
let lastUrlWrite = 0;
function writeUrl(force = false): void {
  const now = performance.now();
  if (!force && (now - lastUrlWrite < 500 || controller.isFlying)) return;
  lastUrlWrite = now;
  const focus = focusBody();
  const rel = controller.worldPosition.clone().sub(focus.world);
  const dist = rel.length();
  const hash = formatHash({
    body: focus.record.id,
    distKm: dist,
    view: {
      azimuthDeg: (Math.atan2(rel.x, rel.z) * 180) / Math.PI,
      elevationDeg: (Math.asin(Math.max(-1, Math.min(1, rel.y / dist))) * 180) / Math.PI,
    },
    time: clockIsLive() ? undefined : clock.date,
  });
  if (hash !== location.hash) history.replaceState(history.state, '', hash);
}
// A hand-edited URL (or a pasted link in the same tab) flies to the new view.
window.addEventListener('hashchange', () => applyViewState(parseHash(location.hash), true));

// ------------------------------------------------------------------ frame loop
let last = performance.now();
let fps = 60;
let lastInfo = 0;
renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  clock.tick(dt);
  system.setTime(clock.jd); // float64 world positions
  const cameraWorld = controller.update(dt); // float64; Three camera stays at (0,0,0)
  const stats = system.render(cameraWorld, camera, canvas.clientHeight, scaleMode);
  ring.update(camera, canvas);
  const focus = focusBody();
  labels.update(scene, camera, {
    focusId: focus.record.id,
    selectedId: selected?.record.id ?? null,
    viewScaleKm: Math.max(controller.altitude, focus.radiusKm),
    w: canvas.clientWidth,
    h: canvas.clientHeight,
  });

  updateTimeUi();
  if (now - lastInfo > 250) {
    info.tick();
    lastInfo = now;
  }
  writeUrl();
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
if (params.has('debug')) Object.assign(window, { __orrery: { system, controller, clock, camera, renderer, scene, ring, get selected() { return selected; } } });
