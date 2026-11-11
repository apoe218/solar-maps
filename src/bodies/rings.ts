import { DoubleSide, Mesh, MeshStandardMaterial, RingGeometry, SRGBColorSpace } from 'three';
import type { RingData } from '../data/bodies';
import { kmToScene } from '../scene/units';
import type { TextureLoaderFn } from './textures';

/**
 * Flat ring in the parent's equatorial plane (local XZ, perpendicular to the spin axis +Y).
 * UVs are remapped so a radial strip texture (u = inner → outer) wraps around the ring.
 */
export function buildRings(data: RingData, loadTexture: TextureLoaderFn): Mesh {
  const inner = kmToScene(data.innerKm);
  const outer = kmToScene(data.outerKm);
  const geometry = new RingGeometry(inner, outer, 180, 1);
  const pos = geometry.attributes.position!;
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  geometry.rotateX(-Math.PI / 2); // XY plane → XZ plane

  const material = new MeshStandardMaterial({
    color: 0xd8c8a0,
    side: DoubleSide,
    transparent: true,
    opacity: data.texture ? 1 : 0.6,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
  });
  if (data.texture) {
    const tex = loadTexture(data.texture, () => {
      material.map = null;
      material.opacity = 0.6;
      material.needsUpdate = true;
    });
    if (tex) {
      tex.colorSpace = SRGBColorSpace;
      material.map = tex; // RGBA: alpha channel gives the gaps
      material.color.set(0xffffff);
    }
  }
  const mesh = new Mesh(geometry, material);
  mesh.name = 'rings';
  return mesh;
}
