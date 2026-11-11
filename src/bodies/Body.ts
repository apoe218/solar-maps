import {
  Color,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BodyRecord } from '../data/bodies';
import { iauEquatorFrame, primeMeridianDeg } from '../ephemeris';
import { eclipticDirToScene, kmToScene } from '../scene/units';
import { buildRings } from './rings';
import { DEFAULT_MIN_PIXELS, displayRadius, type ScaleMode } from './scaleMode';
import type { TextureLoaderFn } from './textures';

const sphereGeometry = new SphereGeometry(1, 64, 32); // shared unit sphere; meshes are scaled

/**
 * A rendered body, built entirely from its bodies.json entry.
 *
 *   root   — positioned at the body's centre (scene units)
 *   └ tilt — IAU equator frame: local +X = equator's node on the J2000 equator, +Y = IAU north pole.
 *     │      Scaled for Explorer mode (rings scale with it).
 *     ├ spin — rotation.y = prime-meridian angle W (IAU), so local +X is the prime meridian
 *     │ └ mesh — unit sphere × real radius; SphereGeometry puts u = 0.5 (longitude 0) on +X
 *     └ rings (optional), in the equatorial plane
 */
export class Body {
  readonly root = new Object3D();
  readonly tilt = new Object3D();
  readonly spin = new Object3D();
  readonly mesh: Mesh;
  readonly rings: Mesh | null;
  /** real mean radius, scene units */
  readonly radius: number;
  /** IAU north pole, scene axes (unit) */
  readonly pole: Vector3;
  private readonly minPixels: number;

  constructor(readonly record: BodyRecord, loadTexture: TextureLoaderFn) {
    const { physical, render } = record;
    this.radius = kmToScene(physical.meanRadiusKm);
    this.minPixels = render.minPixels ?? DEFAULT_MIN_PIXELS;

    this.mesh = new Mesh(sphereGeometry, makeSurfaceMaterial(record, loadTexture));
    this.mesh.scale.setScalar(this.radius);
    this.mesh.name = record.id;

    // Local axes: X = node, Y = pole, Z = X × Y. Rotating about +Y by W then moves +X eastward.
    const frame = iauEquatorFrame(record.rotation.poleRaDeg, record.rotation.poleDecDeg);
    const x = eclipticDirToScene(frame.node);
    this.pole = eclipticDirToScene(frame.pole);
    const z = new Vector3().crossVectors(x, this.pole);
    this.tilt.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, this.pole, z));

    this.rings = render.rings ? buildRings(render.rings, loadTexture) : null;

    this.root.name = record.id;
    this.root.add(this.tilt);
    this.tilt.add(this.spin);
    this.spin.add(this.mesh);
    if (this.rings) this.tilt.add(this.rings);
  }

  /** Rotate to the IAU prime-meridian angle at Julian Date `jd`. */
  setTime(jd: number): void {
    const { w0Deg, wDotDegPerDay } = this.record.rotation;
    this.spin.rotation.y = (primeMeridianDeg(w0Deg, wDotDegPerDay, jd) * Math.PI) / 180;
  }

  /** Apply the scale mode given the camera distance. Returns the drawn radius (scene units). */
  setScale(mode: ScaleMode, distanceToCamera: number, fovDeg: number, viewportHeightPx: number): number {
    const r = displayRadius(mode, this.radius, distanceToCamera, fovDeg, viewportHeightPx, this.minPixels);
    this.tilt.scale.setScalar(r / this.radius);
    return r;
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
