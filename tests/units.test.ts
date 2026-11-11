import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AU_KM } from '../src/ephemeris';
import {
  KM_PER_SCENE_UNIT,
  eclipticAuToSceneDelta,
  eclipticAuToWorldKm,
  eclipticDirToScene,
  float32Step,
  kmToScene,
  worldToScene,
} from '../src/scene/units';

describe('scene/units', () => {
  it('1 scene unit = 1 km', () => {
    expect(KM_PER_SCENE_UNIT).toBe(1);
    expect(kmToScene(42)).toBe(42);
  });

  it('maps ecliptic north to +Y and is a proper rotation (no mirroring)', () => {
    const x = eclipticDirToScene({ x: 1, y: 0, z: 0 });
    const y = eclipticDirToScene({ x: 0, y: 1, z: 0 });
    const z = eclipticDirToScene({ x: 0, y: 0, z: 1 });
    expect(z.toArray()).toEqual([0, 1, -0]);
    expect(new Vector3().crossVectors(x, y).distanceTo(z)).toBe(0);
  });

  it('converts AU to world km and scene deltas', () => {
    expect(eclipticAuToWorldKm({ x: 1, y: 2, z: 3 }).toArray()).toEqual([AU_KM, 3 * AU_KM, -2 * AU_KM]);
    expect(eclipticAuToSceneDelta({ x: 1, y: 0, z: 0 }).x).toBe(kmToScene(AU_KM));
  });

  it('worldToScene subtracts the camera in float64', () => {
    const cam = new Vector3(2.3e8, 1e7, -5e7);
    const world = cam.clone().add(new Vector3(0.001, 0, 0)); // 1 m from a camera 1.5 AU from the Sun
    expect(worldToScene(world, cam).x).toBeCloseTo(0.001, 7); // float64 at 1.5 AU: ~0.03 mm
  });

  it('float32Step', () => {
    expect(float32Step(1)).toBe(2 ** -23);
    expect(float32Step(2.3e8)).toBe(16); // why absolute km can't go on the GPU
  });
});
