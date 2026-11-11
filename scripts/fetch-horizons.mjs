#!/usr/bin/env node
// Regenerates tests/fixtures/horizons.json from the JPL Horizons API.
// Usage: node scripts/fetch-horizons.mjs
// (Behind an HTTPS proxy on Node 22, run with NODE_USE_ENV_PROXY=1.)
import { writeFileSync } from 'node:fs';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
// Horizons IDs 3–6 are system barycentres, which is what Standish's elements describe.
const TARGETS = [
  { id: '3', body: 'earth' }, // Earth–Moon barycentre
  { id: '4', body: 'mars' },
  { id: '5', body: 'jupiter' },
  {
    id: '6',
    body: 'saturn',
    // Standish Table 1 is only good to ~600" for Saturn (1800–2050); measured 0.012–0.029 AU vs Horizons.
    toleranceAu: 0.03,
    toleranceNote: 'Standish Table 1 Saturn error is up to ~600 arcsec (≈0.03 AU) over 1800–2050.',
  },
];
const EPOCHS = [{ date: '2026-01-01T00:00:00Z', jd: 2461041.5 }];

async function fetchVector(id, jd) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${id}'`,
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@10'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'AU-D'",
    VEC_TABLE: "'1'",
    CSV_FORMAT: "'YES'",
    TIME_TYPE: "'TDB'",
    TLIST_TYPE: "'JD'",
    TLIST: `'${jd}'`,
    OBJ_DATA: "'NO'",
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status} for target ${id}`);
  const { result } = await res.json();
  const block = result.split('$$SOE')[1]?.split('$$EOE')[0];
  if (!block) throw new Error(`No $$SOE block for target ${id}:\n${result}`);
  const name = /Target body name:\s*(.+?)\s{2,}/.exec(result)?.[1] ?? id;
  const cols = block.trim().split(',').map((s) => s.trim());
  const [jdOut, , x, y, z] = cols;
  return { name, jd: Number(jdOut), x: Number(x), y: Number(y), z: Number(z) };
}

const entries = [];
for (const { date, jd } of EPOCHS) {
  for (const { id, body, ...extra } of TARGETS) {
    const v = await fetchVector(id, jd);
    entries.push({ body, horizonsId: id, horizonsName: v.name, date, jd: v.jd, x: v.x, y: v.y, z: v.z, ...extra });
  }
}

const fixture = {
  _README:
    'JPL Horizons heliocentric position vectors used as ground truth. Regenerate with `node scripts/fetch-horizons.mjs`. ' +
    'To add entries by hand: Horizons → Ephemeris Type: Vector Table, Center: Sun (500@10), Reference plane: ecliptic, ' +
    'Reference frame: ICRF, Output units: AU-D, Time: TDB, Table: position only. Use system barycentres (3 = Earth–Moon, 4 = Mars, ...). ' +
    'Each entry may set an optional "toleranceAu" (default 0.01).',
  source: 'JPL Horizons API (ssd.jpl.nasa.gov/api/horizons.api), DE441',
  frame: 'Heliocentric (500@10), ecliptic and mean equinox of J2000.0, ICRF',
  units: 'AU',
  timeScale: 'TDB',
  retrieved: new Date().toISOString().slice(0, 10),
  entries,
};
writeFileSync(new URL('../tests/fixtures/horizons.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
console.log(entries);
