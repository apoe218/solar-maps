import { TextureLoader, Vector3 } from 'three';
import { SolarSystem } from './bodies/SolarSystem';
import type { ScaleMode } from './bodies/scaleMode';
import type { TextureLoaderFn } from './bodies/textures';
import { BODIES } from './data/bodies';
import { createScene } from './scene/scene';
import { SimClock } from './ui/clock';
import { mountFocusSelect } from './ui/focusSelect';
import { mountScaleToggle } from './ui/scaleToggle';
import { mountTimeControls } from './ui/timeControls';
import './style.css';

const container = document.getElementById('app');
const ui = document.getElementById('ui');
if (!container || !ui) throw new Error('#app / #ui missing');

const { renderer, scene, camera, controls } = createScene(container);

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
let focusId = 'sun';

const updateTimeUi = mountTimeControls(ui, clock);
mountScaleToggle(ui, scaleMode, (m) => (scaleMode = m));
mountFocusSelect(ui, BODIES, focusId, (id) => {
  focusId = id;
  const body = system.get(id)!;
  // Frame the body: put the camera ~8 radii away (at least a few pixels' worth in Explorer).
  const dir = camera.position.clone().sub(controls.target).normalize();
  const target = body.root.position;
  const dist = Math.max(body.radius * 8, 1e-4);
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(dir, dist);
});

const prevTarget = new Vector3();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  clock.tick((now - last) / 1000);
  last = now;

  system.setTime(clock.jd);

  // Follow the focused body: move camera and target by the body's displacement this frame.
  const focus = system.get(focusId)!.root.position;
  prevTarget.copy(controls.target);
  controls.target.copy(focus);
  camera.position.add(focus.clone().sub(prevTarget));
  controls.update();

  system.setScale(scaleMode, camera, renderer.domElement.clientHeight);
  updateTimeUi();
  renderer.render(scene, camera);
});
