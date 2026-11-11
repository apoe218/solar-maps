import { AmbientLight, Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { kmToScene } from './units';

export interface SceneContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}

/** Near and far planes for the whole range: 1 m (10 km above Phobos needs ≪ 10 km) to ~700 AU. */
export const NEAR_KM = 1e-3;
export const FAR_KM = 1e11;

/** Renderer, camera and ambient light. The camera stays at the origin (floating origin); only it rotates. */
export function createScene(container: HTMLElement): SceneContext {
  // Hard rule 2: a logarithmic depth buffer makes depth precision relative (≈1e-6 of distance at any range),
  // so a 1 m … 10¹¹ km near/far range doesn't z-fight.
  const renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new AmbientLight(0xffffff, 0.06)); // faint fill so night sides aren't pure black

  const camera = new PerspectiveCamera(50, container.clientWidth / container.clientHeight, kmToScene(NEAR_KM), kmToScene(FAR_KM));

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  return { renderer, scene, camera };
}
