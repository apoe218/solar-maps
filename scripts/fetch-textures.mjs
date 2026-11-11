#!/usr/bin/env node
// Downloads the 2k planet textures into public/textures/2k/.
// Usage: node scripts/fetch-textures.mjs   (behind an HTTPS proxy on Node 22: NODE_USE_ENV_PROXY=1)
// Source: Solar System Scope (https://www.solarsystemscope.com/textures/), CC BY 4.0.
// Keep public/textures/CREDITS.md in sync with this list.
import { mkdirSync, writeFileSync } from 'node:fs';

const SSS = 'https://www.solarsystemscope.com/textures/download/';
export const TEXTURES = [
  // [local file, remote file]
  ['sun.jpg', '2k_sun.jpg'],
  ['mercury.jpg', '2k_mercury.jpg'],
  ['venus_atmosphere.jpg', '2k_venus_atmosphere.jpg'],
  ['earth_daymap.jpg', '2k_earth_daymap.jpg'],
  ['moon.jpg', '2k_moon.jpg'],
  ['mars.jpg', '2k_mars.jpg'],
  ['jupiter.jpg', '2k_jupiter.jpg'],
  ['saturn.jpg', '2k_saturn.jpg'],
  ['saturn_ring_alpha.png', '2k_saturn_ring_alpha.png'],
  ['uranus.jpg', '2k_uranus.jpg'],
  ['neptune.jpg', '2k_neptune.jpg'],
];

const outDir = new URL('../public/textures/2k/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const [local, remote] of TEXTURES) {
  const res = await fetch(SSS + remote);
  if (!res.ok) throw new Error(`${remote}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(new URL(local, outDir), buf);
  console.log(`${local.padEnd(24)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ← ${SSS}${remote}`);
}
