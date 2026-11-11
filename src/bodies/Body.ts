import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BodyRecord } from '../data/bodies';
import { iauEquatorFrame, primeMeridianDeg } from '../ephemeris';
import { eclipticDirToScene, kmToScene } from '../scene/units';
import { buildRings } from './rings';
import { DEFAULT_MIN_PIXELS, appearance, projectedDiameterPx, type ScaleMode } from './scaleMode';
import type { TextureLoaderFn } from './textures';

// Shared unit sphere; meshes are scaled. 128×64: facets sit ≤ 0.12% of the radius inside the true sphere
// (≈ 8 km on Jupiter, 1.9 km on Earth, 13 m on Phobos).
const sphereGeometry = new SphereGeometry(1, 128, 64);
const dotGeometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
const discTexture = makeDiscTexture(32);

/**
 * A rendered body, built entirely from its bodies.json entry.
 *
 *   root   — placed at (world − camera) each frame (floating origin)
 *   ├ dot  — fixed-pixel-size point, shown when the sphere would be sub-pixel
 *   └ tilt — IAU equator frame: local +X = equator's node on the J2000 equator, +Y = IAU north pole.
 *     │      Scaled for Explorer mode (rings scale with it).
 *     ├ spin — rotation.y = prime-meridian angle W (IAU), so local +X is the prime meridian
 *     │ └ mesh — unit sphere × real radius; SphereGeometry puts u = 0.5 (longitude 0) on +X
 *     └ rings (optional), in the equatorial plane
 */
export class Body {
  /** Heliocentric position, float64 km, world axes. CPU only. */
  readonly world = new Vector3();
  readonly root = new Object3D();
  readonly tilt = new Object3D();
  readonly spin = new Object3D();
  readonly mesh: Mesh;
  readonly dot: Points;
  readonly rings: Mesh | null;
  /** real mean radius, km */
  readonly radiusKm: number;
  /** IAU north pole, scene axes (unit) */
  readonly pole: Vector3;
  /** last appearance decision (for hysteresis and the debug overlay) */
  isDot = false;
  private readonly minPixels: number;

  constructor(readonly record: BodyRecord, loadTexture: TextureLoaderFn) {
    const { physical, render } = record;
    this.radiusKm = physical.meanRadiusKm;
    this.minPixels = render.minPixels ?? DEFAULT_MIN_PIXELS;

    this.mesh = new Mesh(sphereGeometry, makeSurfaceMaterial(record, loadTexture));
    this.mesh.scale.setScalar(kmToScene(this.radiusKm));
    this.mesh.name = record.id;

    // Local axes: X = node, Y = pole, Z = X × Y. Rotating about +Y by W then moves +X eastward.
    const frame = iauEquatorFrame(record.rotation.poleRaDeg, record.rotation.poleDecDeg);
    const x = eclipticDirToScene(frame.node);
    this.pole = eclipticDirToScene(frame.pole);
    const z = new Vector3().crossVectors(x, this.pole);
    this.tilt.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, this.pole, z));

    this.rings = render.rings ? buildRings(render.rings, loadTexture) : null;

    this.dot = new Points(
      dotGeometry,
      new PointsMaterial({
        color: new Color(render.color),
        size: this.minPixels,
        sizeAttenuation: false, // size is in CSS px (Three multiplies by the pixel ratio)
        alphaMap: discTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.dot.name = `${record.id}-dot`;
    this.dot.visible = false;
    this.dot.frustumCulled = false;

    this.root.name = record.id;
    this.root.add(this.tilt, this.dot);
    this.tilt.add(this.spin);
    this.spin.add(this.mesh);
    if (this.rings) this.tilt.add(this.rings);
  }

  /** Rotate to the IAU prime-meridian angle at Julian Date `jd`. */
  setTime(jd: number): void {
    const { w0Deg, wDotDegPerDay } = this.record.rotation;
    this.spin.rotation.y = (primeMeridianDeg(w0Deg, wDotDegPerDay, jd) * Math.PI) / 180;
  }

  /**
   * Choose sphere / enlarged sphere / dot for the current view. `distanceKm` is from the camera to the
   * body's centre (float64). Returns the projected real diameter in px.
   */
  updateAppearance(mode: ScaleMode, distanceKm: number, fovDeg: number, viewportHeightPx: number): number {
    const px = projectedDiameterPx(this.radiusKm, distanceKm, fovDeg, viewportHeightPx);
    const a = appearance(mode, px, this.isDot, this.minPixels);
    this.isDot = a.dot;
    this.tilt.visible = !a.dot;
    this.dot.visible = a.dot;
    (this.dot.material as PointsMaterial).size = a.dotPx;
    this.tilt.scale.setScalar(a.sphereScale);
    return px;
  }
}

function makeSurfaceMaterial(record: BodyRecord, loadTexture: TextureLoaderFn): MeshStandardMaterial {
  const color = new Color(record.render.color);
  const isStar = record.type === 'star';
  // Stars glow: black diffuse + emissive, so lights don't affect them. Everything else is lit by the Sun.
  const material = isStar
    ? new MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1, roughness: 1, metalness: 0 })
    : new MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  if (record.render.texture) {
    const tex = loadTexture(record.render.texture, () => {
      // Fall back to the flat colour if the file is missing.
      if (isStar) material.emissiveMap = null, material.emissive.copy(color);
      else material.map = null, material.color.copy(color);
      material.needsUpdate = true;
    });
    if (tex) {
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      if (isStar) {
        material.emissiveMap = tex;
        material.emissive.set(0xffffff);
      } else {
        material.map = tex;
        material.color.set(0xffffff);
      }
    }
  }
  return material;
}

/** Soft-edged disc used as the dot's alpha map (no DOM needed). */
function makeDiscTexture(size: number): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c) / (size / 2);
      const a = Math.round(255 * Math.min(1, Math.max(0, (1 - r) / 0.15))); // 15% soft rim
      data.set([a, a, a, 255], (y * size + x) * 4);
    }
  }
  const tex = new DataTexture(data, size, size);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
