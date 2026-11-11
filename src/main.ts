import { TextureLoader } from 'three';
import { SolarSystem } from './bodies/SolarSystem';
import type { ScaleMode } from './bodies/scaleMode';
import type { TextureLoaderFn } from './bodies/textures';
import { BODIES } from './data/bodies';
import { CameraController } from './nav/CameraController';
import { createScene } from './scene/scene';
import { SimClock } from './ui/clock';
import { mountDebugOverlay } from './ui/debugOverlay';
import { mountFocusSelect } from './ui/focusSelect';
import { mountScaleToggle } from './ui/scaleToggle';
import { mountTimeControls } from './ui/timeControls';
import './style.css';

const container = document.getElementById('app');
const ui = document.getElementById('ui');
if (!container || !ui) throw new Error('#app / #ui missing');

const params = new URLSearchParams(location.search);
const { renderer, scene, camera } = createScene(container);

const loader = new TextureLoader();
const loadTexture: TextureLoaderFn = (path, onError) =>
  loader.load(import.meta.env.BASE_URL + path, undefined, undefined, () => {
    console.warn(`Texture missing: ${path} — using flat colour`);
    onError();
  });

const system = new SolarSystem(BODIES, loadTexture);
scene.add(system.group);

const clock = new SimClock();
let scaleMode: ScaleMode = 'explorer';
let focus = system.get('sun')!;

const controller = new CameraController(renderer.domElement, camera);
controller.setFocus(focus.radiusKm);
controller.setTarget({ altitude: 4.2e8, elevation: 0.7, azimuth: 0.6 }, true); // inner solar system

const updateTimeUi = mountTimeControls(ui, clock);
mountScaleToggle(ui, scaleMode, (m) => (scaleMode = m));
mountFocusSelect(ui, BODIES, focus.record.id, (id) => {
  focus = system.get(id)!;
  controller.setFocus(focus.radiusKm);
});
const debug = mountDebugOverlay(ui, params.has('debug'));

let last = performance.now();
let fps = 60;
renderer.setAnimationLoop((now) => {
  const dt = (now - last) / 1000;
  last = now;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  clock.tick(dt);
  system.setTime(clock.jd); // float64 world positions
  const cameraWorld = controller.update(dt, focus.world); // float64; Three camera stays at (0,0,0)
  const stats = system.render(cameraWorld, camera, renderer.domElement.clientHeight, scaleMode);

  updateTimeUi();
  debug.update({
    fps,
    focusName: focus.record.name,
    focusAltitudeKm: controller.state.altitude,
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
if (params.has('debug')) Object.assign(window, { __orrery: { system, controller, clock, camera, renderer, scene } });
