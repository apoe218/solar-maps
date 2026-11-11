import { Matrix4, Mesh, PerspectiveCamera, SphereGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ORBIT_SAMPLES } from '../src/bodies/OrbitLine';
import { SolarSystem } from '../src/bodies/SolarSystem';
import { noTextures } from '../src/bodies/textures';
import { BODIES } from '../src/data/bodies';
import { bodyFixedLonLat, heliocentricPosition, scale } from '../src/ephemeris';
import { minAltitudeKm } from '../src/nav/CameraController';
import { quaternionFromYawPitch, yawPitchFromForward } from '../src/nav/flight';

/** Camera `altitude` km above a body's surface at (azimuth, elevation), looking at its centre, tilted by `tilt`. */
interface OrbitState { azimuth: number; elevation: number; altitude: number; tilt: number }
function cameraWorldPosition(focus: Vector3, radius: number, s: OrbitState): Vector3 {
  const ce = Math.cos(s.elevation);
  return new Vector3(ce * Math.sin(s.azimuth), Math.sin(s.elevation), ce * Math.cos(s.azimuth)).multiplyScalar(radius + s.altitude).add(focus);
}
function cameraQuaternion(s: OrbitState) {
  const off = cameraWorldPosition(new Vector3(), 1, s);
  const { yaw, pitch } = yawPitchFromForward(off.negate());
  return quaternionFromYawPitch(yaw, pitch + s.tilt);
}
import { eclipticAuToWorldKm, eclipticDirToScene } from '../src/scene/units';

const JD = 2461041.5; // 2026-01-01

function setup(focusId: string, state: OrbitState, mode: 'explorer' | 'true' = 'explorer') {
  const system = new SolarSystem(BODIES, noTextures);
  system.setTime(JD);
  const focus = system.get(focusId)!;
  const camera = new PerspectiveCamera(50, 1.6, 1e-3, 1e11);
  camera.quaternion.copy(cameraQuaternion(state));
  camera.updateMatrixWorld();
  const cameraWorld = cameraWorldPosition(focus.world, focus.radiusKm, state);
  const stats = system.render(cameraWorld, camera, 800, mode);
  system.group.updateMatrixWorld(true);
  return { system, focus, camera, cameraWorld, stats };
}
const nearPhobos: OrbitState = { azimuth: 1, elevation: 0.3, altitude: 10, tilt: 0 };

describe('SolarSystem (floating origin)', () => {
  it('builds one Body per bodies.json entry and an orbit line for each orbiting body', () => {
    const { system } = setup('sun', { ...nearPhobos, altitude: 1e8 });
    expect(system.bodies.map((b) => b.record.id).sort()).toEqual(BODIES.map((b) => b.id).sort());
    expect([...system.orbits.keys()].sort()).toEqual(BODIES.filter((b) => b.orbit).map((b) => b.id).sort());
  });

  it('keeps float64 world positions equal to the ephemeris', () => {
    const { system } = setup('sun', { ...nearPhobos, altitude: 1e8 });
    for (const id of ['earth', 'moon', 'phobos', 'saturn']) {
      const expected = eclipticAuToWorldKm(heliocentricPosition(BODIES, id, JD));
      expect(system.get(id)!.world.distanceTo(expected), id).toBeLessThan(1e-7); // km: float64 add-order noise, < 0.1 mm
    }
  });

  it('renders relative to the camera: the camera is at the origin and the focus is at −offset', () => {
    const { focus, camera, cameraWorld } = setup('phobos', nearPhobos);
    expect(camera.position.length()).toBe(0);
    expect(focus.root.position.length()).toBeCloseTo(21.05, 6); // 10 km above an 11.05 km moon
    expect(focus.root.position.clone().add(cameraWorld).distanceTo(focus.world)).toBeLessThan(1e-6);
  });

  it('reports the nearest body and altitude, and small scene coordinates near the camera', () => {
    const { stats, focus } = setup('phobos', nearPhobos);
    expect(stats.nearestId).toBe('phobos');
    expect(stats.nearestAltitudeKm).toBeCloseTo(10, 6);
    expect(focus.root.position.length()).toBeLessThan(100);
  });

  it('orbit lines: 360 samples, vertex 0 at the body, placed at the body', () => {
    const { system } = setup('earth', { ...nearPhobos, altitude: 1e5 });
    for (const id of ['earth', 'moon', 'phobos']) {
      const orbit = system.orbits.get(id)!;
      const pos = orbit.line.geometry.attributes.position!;
      expect(pos.count).toBe(ORBIT_SAMPLES);
      expect(new Vector3().fromBufferAttribute(pos, 0).length()).toBe(0);
      expect(orbit.line.position.equals(system.get(id)!.root.position)).toBe(true);
    }
  });

  it('orbit line spans the full orbit (max extent ≈ 2a(1+e) for Earth)', () => {
    const { system } = setup('earth', { ...nearPhobos, altitude: 1e5 });
    const pos = system.orbits.get('earth')!.line.geometry.attributes.position!;
    let max = 0;
    for (let i = 0; i < pos.count; i++) max = Math.max(max, new Vector3().fromBufferAttribute(pos, i).length());
    expect(max / 1.496e8).toBeGreaterThan(1.96);
    expect(max / 1.496e8).toBeLessThan(2.04);
  });

  it('mesh +X is the IAU prime meridian; tilt +Y is the pole', () => {
    const { system } = setup('sun', { ...nearPhobos, altitude: 1e8 });
    for (const b of system.bodies) {
      const worldX = new Vector3(1, 0, 0).transformDirection(b.mesh.matrixWorld);
      const { lonDeg, latDeg } = bodyFixedLonLat({ x: worldX.x, y: -worldX.z, z: worldX.y }, b.record.rotation, JD);
      expect(Math.abs(lonDeg), b.record.id).toBeLessThan(1e-6);
      expect(Math.abs(latDeg), b.record.id).toBeLessThan(1e-6);
      expect(b.pole.distanceTo(new Vector3(0, 1, 0).transformDirection(b.tilt.matrixWorld))).toBeLessThan(1e-9);
    }
  });

  it('SphereGeometry maps texture u = 0.5 (longitude 0) to local +X, as Body assumes', () => {
    const g = new SphereGeometry(1, 128, 64);
    const uv = g.attributes.uv!, pos = g.attributes.position!;
    for (let i = 0; i < uv.count; i++) {
      if (uv.getX(i) === 0.5 && uv.getY(i) === 0.5) {
        expect(new Vector3().fromBufferAttribute(pos, i).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9);
        return;
      }
    }
    throw new Error('no vertex at u = v = 0.5');
  });

  it("Earth's sub-solar point faces the Sun on the mesh", () => {
    const { system } = setup('sun', { ...nearPhobos, altitude: 1e8 });
    const earth = system.get('earth')!;
    const sunDirEcl = scale(heliocentricPosition(BODIES, 'earth', JD), -1);
    const toSun = eclipticDirToScene(sunDirEcl).normalize();
    const { lonDeg, latDeg } = bodyFixedLonLat(sunDirEcl, earth.record.rotation, JD);
    const r = Math.PI / 180;
    const local = new Vector3(Math.cos(latDeg * r) * Math.cos(lonDeg * r), Math.sin(latDeg * r), -Math.cos(latDeg * r) * Math.sin(lonDeg * r));
    expect(local.transformDirection(earth.mesh.matrixWorld).dot(toSun)).toBeCloseTo(1, 9);
  });

  it("Saturn's rings lie in its equatorial plane", () => {
    const { system } = setup('saturn', { ...nearPhobos, altitude: 2e5 });
    const saturn = system.get('saturn')!;
    const rings = saturn.rings as Mesh;
    rings.geometry.computeVertexNormals();
    const n = new Vector3().fromBufferAttribute(rings.geometry.attributes.normal!, 0).transformDirection(rings.matrixWorld);
    expect(Math.abs(n.dot(saturn.pole))).toBeCloseTo(1, 9);
  });

  it('explorer: far bodies become dots, the near focus stays a real sphere; true scale never enlarges', () => {
    const { system } = setup('phobos', nearPhobos, 'explorer');
    expect(system.get('phobos')!.isDot).toBe(false);
    expect(system.get('phobos')!.tilt.scale.x).toBe(1);
    expect(system.get('neptune')!.isDot).toBe(true);
    expect(system.get('neptune')!.dot.visible).toBe(true);
    expect(system.get('neptune')!.tilt.visible).toBe(false);
    const t = setup('phobos', nearPhobos, 'true');
    for (const b of t.system.bodies) expect(b.tilt.scale.x).toBe(1);
  });

  it('puts the sunlight at the Sun', () => {
    const { system } = setup('sun', { ...nearPhobos, altitude: 1e8 });
    expect(system.sunLight.parent).toBe(system.get('sun')!.root);
  });
});

/**
 * Simulates what the GPU sees: Three computes modelMatrix / modelViewMatrix in float64 and uploads
 * them as float32; vertex positions are float32. We round exactly like that and compare the
 * resulting view-space surface points with the float64 truth.
 */
describe('precision on the GPU (float32 simulation)', () => {
  const f32 = (m: Matrix4) => new Matrix4().fromArray(m.elements.map(Math.fround));
  const f32v = (v: Vector3) => new Vector3(Math.fround(v.x), Math.fround(v.y), Math.fround(v.z));

  /** Worst view-space error (km) of near-side surface points, and the same in screen pixels. */
  function worstError(focusId: string, state: OrbitState, uploadWorld: 'relative' | 'absolute') {
    const { focus, camera, cameraWorld } = setup(focusId, state);
    const mesh = focus.mesh;
    // Points on the unit sphere around the sub-camera point (where you look when this low).
    const toCamLocal = cameraWorld.clone().sub(focus.world).normalize()
      .applyMatrix4(new Matrix4().copy(mesh.matrixWorld).invert().setPosition(0, 0, 0)).normalize();
    const pts = [toCamLocal, ...[[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(([x, y, z]) =>
      toCamLocal.clone().add(new Vector3(x, y, z).multiplyScalar(1e-4)).normalize())];
    let worst = 0;
    for (const p of pts) {
      const local = f32v(p); // vertex buffers are float32
      const truth = local.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const model = mesh.matrixWorld.clone();
      const view = camera.matrixWorldInverse.clone();
      if (uploadWorld === 'absolute') {
        // What a Sun-centred scene would upload: world matrix carries the absolute position.
        model.premultiply(new Matrix4().makeTranslation(cameraWorld.x, cameraWorld.y, cameraWorld.z));
        view.multiply(new Matrix4().makeTranslation(-cameraWorld.x, -cameraWorld.y, -cameraWorld.z));
      }
      // Two GPU paths: modelViewMatrix (most vertices) and modelMatrix → viewMatrix (world-space shader code).
      const viaModelView = f32v(local.clone().applyMatrix4(f32(view.clone().multiply(model))));
      const viaWorld = f32v(local.clone().applyMatrix4(f32(model))).applyMatrix4(f32(view));
      worst = Math.max(worst, viaModelView.distanceTo(truth), viaWorld.distanceTo(truth));
    }
    const pixelAngle = ((50 * Math.PI) / 180) / 800; // fov 50°, 800 px tall
    return { km: worst, px: worst / state.altitude / pixelAngle };
  }

  it('10 km above Phobos: sub-centimetre, ≪ 1 px', () => {
    const e = worstError('phobos', nearPhobos, 'relative');
    expect(e.km).toBeLessThan(1e-5);
    expect(e.px).toBeLessThan(0.01);
  });

  it('at the altitude floor above Earth (1.6 km): < 0.5 px', () => {
    expect(worstError('earth', { ...nearPhobos, altitude: minAltitudeKm(6371) }, 'relative').px).toBeLessThan(0.5);
  });

  it('10 km above Earth and above Jupiter: < 0.1 px', () => {
    expect(worstError('earth', { ...nearPhobos, altitude: 10 }, 'relative').px).toBeLessThan(0.1);
    expect(worstError('jupiter', { ...nearPhobos, altitude: minAltitudeKm(69911) * 10 }, 'relative').px).toBeLessThan(0.1);
  });

  it('for contrast: Sun-centred coordinates near Phobos err by kilometres (hundreds of px)', () => {
    const e = worstError('phobos', nearPhobos, 'absolute');
    expect(e.km).toBeGreaterThan(1);
    expect(e.px).toBeGreaterThan(100);
  });
});

