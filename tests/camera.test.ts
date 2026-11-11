import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  MIN_ALTITUDE_KM,
  minAltitudeKm,
  cameraQuaternion,
  cameraWorldPosition,
  clampState,
  horizonAngle,
  rotationPerPixel,
  type OrbitState,
} from '../src/nav/CameraController';

const s = (o: Partial<OrbitState>): OrbitState => ({ azimuth: 0, elevation: 0, altitude: 10, tilt: 0, ...o });

describe('camera maths', () => {
  it('allows 10 km above any moon (largest: Ganymede, 2,634 km)', () => {
    expect(minAltitudeKm(2634)).toBeLessThan(10);
    expect(minAltitudeKm(11.05)).toBe(0.1);
  });

  it('places the camera at radius + altitude from the focus centre (float64)', () => {
    const focus = new Vector3(2.279e8, 1.3e6, -4.1e7); // ~Mars, km
    const p = cameraWorldPosition(focus, 11.05, s({ altitude: 10, azimuth: 1, elevation: 0.3 }));
    expect(p.distanceTo(focus)).toBeCloseTo(21.05, 6);
  });

  it.each([
    [0, 0, 0],
    [1.2, 0.4, 0],
    [-2.5, -1.2, 0],
    [0.3, 1.4, 0],
  ])('looks at the focus centre (az %f, el %f)', (azimuth, elevation, tilt) => {
    const st = s({ azimuth, elevation, tilt });
    const offset = cameraWorldPosition(new Vector3(), 1, st).normalize();
    const forward = new Vector3(0, 0, -1).applyQuaternion(cameraQuaternion(st));
    expect(forward.dot(offset)).toBeCloseTo(-1, 12);
  });

  it('tilt pitches the view up toward the horizon', () => {
    const st = s({ elevation: 0.5, tilt: 0.5 });
    const forward = new Vector3(0, 0, -1).applyQuaternion(cameraQuaternion(st));
    const offset = cameraWorldPosition(new Vector3(), 1, st).normalize();
    expect(Math.acos(-forward.dot(offset))).toBeCloseTo(0.5, 12);
  });

  it('limits tilt to the horizon, so the view centre never points into space', () => {
    expect(horizonAngle(10, 11.05)).toBeCloseTo(Math.asin(11.05 / 21.05), 12); // Phobos: 31.7°
    expect(clampState(s({ altitude: 10, tilt: 1.2 }), 11.05).tilt).toBeCloseTo(Math.asin(11.05 / 21.05), 12);
    expect(clampState(s({ altitude: 1.6, tilt: 1.2 }), 6371).tilt).toBe(1.2); // near Earth's surface: 68.8° allowed
  });

  it('clamps altitude to the floor, and elevation/tilt to ±85°/0–85°', () => {
    const c = clampState(s({ altitude: -5, elevation: 2, tilt: -1 }), 6371);
    expect(c.altitude).toBeCloseTo(1.59275, 9); // Earth: radius-proportional floor
    expect(clampState(s({ altitude: -5 }), 11.05).altitude).toBe(MIN_ALTITUDE_KM); // Phobos: absolute floor
    expect(c.elevation).toBeCloseTo((85 * Math.PI) / 180, 12);
    expect(c.tilt).toBe(0);
  });

  it('drag speed: ground follows the cursor near the surface, half a turn per screen far away', () => {
    const near = rotationPerPixel(10, 6371, 50, 800);
    // arc length per px at the surface = ground size of a px from 10 km up
    expect(near * 6371).toBeCloseTo((2 * 10 * Math.tan((25 * Math.PI) / 180)) / 800, 9);
    expect(rotationPerPixel(1e9, 6371, 50, 800)).toBeCloseTo(Math.PI / 800, 12);
  });
});
