import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AU_KM } from '../src/ephemeris';
import { SCENE_UNITS_PER_AU, auToScene, eclipticAuToScene, eclipticDirToScene, kmToScene } from '../src/scene/units';

describe('scene/units', () => {
  it('converts AU and km consistently', () => {
    expect(auToScene(1)).toBeCloseTo(kmToScene(AU_KM), 9);
    expect(SCENE_UNITS_PER_AU).toBeCloseTo(149.5978707, 7);
  });

  it('maps ecliptic north to scene +Y and is a proper rotation (no mirroring)', () => {
    const x = eclipticDirToScene({ x: 1, y: 0, z: 0 });
    const y = eclipticDirToScene({ x: 0, y: 1, z: 0 });
    const z = eclipticDirToScene({ x: 0, y: 0, z: 1 });
    expect(z.toArray()).toEqual([0, 1, -0]);
    expect(new Vector3().crossVectors(x, y).distanceTo(z)).toBe(0); // x × y = z survives the mapping
  });

  it('scales positions', () => {
    expect(eclipticAuToScene({ x: 1, y: 2, z: 3 }).toArray()).toEqual([auToScene(1), auToScene(3), -auToScene(2)]);
  });
});
