import { AmbientLight, Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { auToScene } from './units';

export interface SceneContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
}

/** Renderer, camera, controls and ambient light. Bodies (and the Sun's point light) are added by the caller. */
export function createScene(container: HTMLElement): SceneContext {
  // Hard rule 2: logarithmic depth buffer for the huge near/far range.
  const renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new AmbientLight(0xffffff, 0.06)); // faint fill so night sides aren't pure black

  // near = 1 km, far ≈ 670 AU (scene units are 10⁶ km)
  const camera = new PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1e-6, 1e5);
  camera.position.set(0, auToScene(2.2), auToScene(2.6));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.zoomSpeed = 2;
  controls.minDistance = 1e-5;
  controls.maxDistance = auToScene(200);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { renderer, scene, camera, controls };
}
