import {
  AmbientLight,
  Color,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Minimal Phase 0 scene: a lit yellow sphere at the origin with orbit controls. */
export function createScene(container: HTMLElement): void {
  // Hard rule 2: logarithmic depth buffer for huge dynamic range.
  const renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x000000);

  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1e6);
  camera.position.set(0, 2, 6);

  const sun = new Mesh(
    new SphereGeometry(1, 64, 32),
    new MeshStandardMaterial({ color: 0xffcc00, emissive: 0x332200, roughness: 0.6 }),
  );
  scene.add(sun);

  scene.add(new AmbientLight(0xffffff, 0.15));
  const light = new PointLight(0xffffff, 60);
  light.position.set(5, 4, 5);
  scene.add(light);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}
