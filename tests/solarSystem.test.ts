import { Mesh, PerspectiveCamera, SphereGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ORBIT_SAMPLES } from '../src/bodies/OrbitLine';
import { SolarSystem } from '../src/bodies/SolarSystem';
import { noTextures } from '../src/bodies/textures';
import { BODIES } from '../src/data/bodies';
import { bodyFixedLonLat, heliocentricPosition, scale } from '../src/ephemeris';
import { eclipticAuToScene, eclipticDirToScene } from '../src/scene/units';

const JD = 2461041.5; // 2026-01-01
const build = () => {
  const s = new SolarSystem(BODIES, noTextures);
  s.setTime(JD);
  s.group.updateMatrixWorld(true);
  return s;
};

describe('SolarSystem', () => {
  it('builds one Body per bodies.json entry and an orbit line for each orbiting body', () => {
    const s = build();
    expect(s.bodies.map((b) => b.record.id).sort()).toEqual(BODIES.map((b) => b.id).sort());
    expect([...s.orbits.keys()].sort()).toEqual(BODIES.filter((b) => b.orbit).map((b) => b.id).sort());
  });

  it('places bodies at their ephemeris positions', () => {
    const s = build();
    for (const id of ['earth', 'moon', 'saturn']) {
      const expected = eclipticAuToScene(heliocentricPosition(BODIES, id, JD));
      expect(s.get(id)!.root.position.distanceTo(expected), id).toBeLessThan(1e-9);
    }
  });

  it('orbit lines have 360 samples, pass through the body, and are centred on the parent', () => {
    const s = build();
    for (const id of ['earth', 'moon']) {
      const orbit = s.orbits.get(id)!;
      const pos = orbit.line.geometry.attributes.position!;
      expect(pos.count).toBe(ORBIT_SAMPLES);
      const vertex0 = new Vector3().fromBufferAttribute(pos, 0).add(orbit.line.position);
      expect(vertex0.distanceTo(s.get(id)!.root.position), id).toBeLessThan(1e-3); // float32 at ~150 units
    }
    expect(s.orbits.get('moon')!.line.position.equals(s.get('earth')!.root.position)).toBe(true);
  });

  it('re-samples an orbit once the body moves half a segment', () => {
    const s = build();
    const orbit = s.orbits.get('earth')!;
    const step = orbit.periodDays / ORBIT_SAMPLES;
    expect(orbit.update(JD + step * 0.4)).toBe(false);
    expect(orbit.update(JD + step * 0.6)).toBe(true);
  });

  it('orients each body so its mesh +X is the IAU prime meridian (matches the ephemeris)', () => {
    const s = build();
    for (const b of s.bodies) {
      // Direction of mesh-local +X in the world, converted back to an ecliptic direction.
      const worldX = new Vector3(1, 0, 0).transformDirection(b.mesh.matrixWorld);
      const ecl = { x: worldX.x, y: -worldX.z, z: worldX.y };
      const { lonDeg, latDeg } = bodyFixedLonLat(ecl, b.record.rotation, JD);
      expect(Math.abs(lonDeg), b.record.id).toBeLessThan(1e-6);
      expect(Math.abs(latDeg), b.record.id).toBeLessThan(1e-6);
      expect(b.pole.distanceTo(new Vector3(0, 1, 0).transformDirection(b.tilt.matrixWorld))).toBeLessThan(1e-9);
    }
  });

  it('SphereGeometry maps texture u = 0.5 (longitude 0) to local +X, as Body assumes', () => {
    const g = new SphereGeometry(1, 64, 32);
    const uv = g.attributes.uv!, pos = g.attributes.position!;
    for (let i = 0; i < uv.count; i++) {
      if (uv.getX(i) === 0.5 && uv.getY(i) === 0.5) {
        expect(new Vector3().fromBufferAttribute(pos, i).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9);
        return;
      }
    }
    throw new Error('no vertex at u = v = 0.5');
  });

  it("Earth's sub-solar point is on the lit side of the mesh", () => {
    const s = build();
    const earth = s.get('earth')!;
    const toSun = eclipticDirToScene(scale(heliocentricPosition(BODIES, 'earth', JD), -1)).normalize();
    const { lonDeg, latDeg } = bodyFixedLonLat(
      scale(heliocentricPosition(BODIES, 'earth', JD), -1), earth.record.rotation, JD);
    // Point on the mesh at that lon/lat (SphereGeometry: x = cos lat cos lon, y = sin lat, z = −cos lat sin lon)
    const r = Math.PI / 180;
    const local = new Vector3(Math.cos(latDeg * r) * Math.cos(lonDeg * r), Math.sin(latDeg * r), -Math.cos(latDeg * r) * Math.sin(lonDeg * r));
    expect(local.transformDirection(earth.mesh.matrixWorld).dot(toSun)).toBeCloseTo(1, 9);
  });

  it("Saturn's rings lie in its equatorial plane", () => {
    const s = build();
    const saturn = s.get('saturn')!;
    const rings = saturn.rings as Mesh;
    rings.geometry.computeVertexNormals();
    const n = new Vector3().fromBufferAttribute(rings.geometry.attributes.normal!, 0).transformDirection(rings.matrixWorld);
    expect(Math.abs(n.dot(saturn.pole))).toBeCloseTo(1, 9);
  });

  it('explorer scale enlarges distant bodies to the minimum pixel size; true scale does not', () => {
    const s = build();
    const camera = new PerspectiveCamera(50, 1, 1e-6, 1e5);
    camera.position.set(0, 500, 0);
    s.setScale('true', camera, 800);
    expect(s.get('earth')!.tilt.scale.x).toBe(1);
    s.setScale('explorer', camera, 800);
    expect(s.get('earth')!.tilt.scale.x).toBeGreaterThan(100);
  });

  it('puts the sunlight at the Sun', () => {
    const s = build();
    expect(s.sunLight.parent).toBe(s.get('sun')!.root);
  });
});
