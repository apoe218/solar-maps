import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Hard rule 3: src/ephemeris must be pure — no rendering, DOM or data imports.
const dir = join(__dirname, '..', 'src', 'ephemeris');
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));

describe('ephemeris purity', () => {
  it.each(files)('%s has no three/DOM/JSON dependencies', (f) => {
    const src = readFileSync(join(dir, f), 'utf8');
    expect(src).not.toMatch(/from\s+['"]three/);
    expect(src).not.toMatch(/\.json['"]/);
    expect(src).not.toMatch(/\b(window|document)\./);
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) expect(m[1], `${f} imports ${m[1]}`).toMatch(/^\.\//);
  });
});
