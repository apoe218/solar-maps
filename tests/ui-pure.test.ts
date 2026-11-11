import { describe, expect, it } from 'vitest';
import { BODIES } from '../src/data/bodies';
import { formatDistanceParam, formatHash, formatTime, parseDistance, parseHash, parseTime } from '../src/nav/urlState';
import { formatDays, formatDistance, formatKm, typeLabel } from '../src/ui/format';
import { editDistance, normalize, scoreString, search, type SearchEntry } from '../src/ui/fuzzy';
import { cullOverlaps, distanceFade, labelPriority } from '../src/ui/labelLayout';

const RANK: Record<string, number> = { star: 0, planet: 1, 'dwarf-planet': 2, moon: 3 };
const entries: SearchEntry[] = BODIES.map((b) => ({ id: b.id, name: b.name, aliases: b.aliases, rank: RANK[b.type]! }));
const top = (q: string) => search(entries, q)[0]?.id;

describe('fuzzy search', () => {
  it('normalises case, accents and punctuation', () => {
    expect(normalize('  Mårs!  I ')).toBe('mars i');
  });

  it.each([
    ['mars', 'mars'], ['MA', 'mars'], ['sat', 'saturn'], ['j', 'jupiter'], ['pho', 'phobos'],
    ['luna', 'moon'], ['red planet', 'mars'], ['planet', 'mars'], ['sol', 'sun'], ['jove', 'jupiter'],
    ['jupitr', 'jupiter'], ['satrun', 'saturn'], ['nptune', 'neptune'], ['plto', 'pluto'], ['mercruy', 'mercury'],
    ['nptn', 'neptune'], ['134340', 'pluto'], ['morning star', 'venus'],
  ])('"%s" → %s', (q, id) => {
    expect(top(q)).toBe(id);
  });

  it('reports the alias that matched', () => {
    expect(search(entries, 'luna')[0]).toMatchObject({ id: 'moon', alias: 'Luna' });
    expect(search(entries, 'moon')[0]).toMatchObject({ id: 'moon', alias: null });
  });

  it('ranks ties by importance: "m" → Mars and Mercury (planets) before the Moon', () => {
    const ids = search(entries, 'm').map((h) => h.id);
    expect(ids.indexOf('moon')).toBeGreaterThan(ids.indexOf('mars'));
    expect(ids.indexOf('moon')).toBeGreaterThan(ids.indexOf('mercury'));
  });

  it('empty query lists bodies by importance; nonsense finds nothing', () => {
    expect(search(entries, '', 20)[0]!.id).toBe('sun');
    expect(search(entries, 'xqzzy')).toEqual([]);
  });

  it('edit distance counts transpositions as one edit', () => {
    expect(editDistance('saturn', 'satrun')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(scoreString('Jupiter', 'zzz')).toBe(0);
  });
});

describe('URL state', () => {
  it('parses the documented example', () => {
    expect(parseHash('#body=mars&dist=20000km&t=2026-11-11')).toEqual({
      body: 'mars', distKm: 20000, time: new Date('2026-11-11T00:00:00Z'),
    });
  });

  it('round-trips a full state', () => {
    const s = { body: 'phobos', distKm: 21.05, view: { azimuthDeg: 35, elevationDeg: -20 }, time: new Date('2026-11-11T08:30:00Z') };
    expect(formatHash(s)).toBe('#body=phobos&dist=21.1km&view=35,-20&t=2026-11-11T08:30Z');
    const back = parseHash(formatHash(s));
    expect(back.body).toBe('phobos');
    expect(back.distKm).toBeCloseTo(21.1, 6);
    expect(back.view).toEqual({ azimuthDeg: 35, elevationDeg: -20 });
    expect(back.time!.toISOString()).toBe('2026-11-11T08:30:00.000Z');
  });

  it.each([
    ['20000km', 20000], ['20000', 20000], ['2.8AU', 2.8 * 149_597_870.7], ['450m', 0.45], ['1e5km', 1e5],
    ['-5km', null], ['abc', null], ['0km', null],
  ])('distance %s', (s, km) => {
    const v = parseDistance(s as string);
    if (km === null) expect(v).toBeNull();
    else expect(v).toBeCloseTo(km as number, 6);
  });

  it('formats distances with sensible units', () => {
    expect(formatDistanceParam(0.45)).toBe('450m');
    expect(formatDistanceParam(13558)).toBe('13600km');
    expect(formatDistanceParam(4.2e8)).toBe('2.81AU');
  });

  it('times: date-only, minute and second precision; invalid ignored', () => {
    expect(parseTime('2026-11-11')!.toISOString()).toBe('2026-11-11T00:00:00.000Z');
    expect(parseTime('2026-11-11T08:30Z')!.toISOString()).toBe('2026-11-11T08:30:00.000Z');
    expect(parseTime('2026-11-11T08:30:15Z')!.toISOString()).toBe('2026-11-11T08:30:15.000Z');
    expect(parseTime('soon')).toBeNull();
    expect(formatTime(new Date('2026-11-11T00:00:00Z'))).toBe('2026-11-11');
  });

  it('ignores junk and unknown keys safely', () => {
    expect(parseHash('#body=<script>&dist=far&view=a,b&t=never&x=1')).toEqual({});
    expect(parseHash('')).toEqual({});
    expect(parseHash('#body=Mars&view=10,200').view).toEqual({ azimuthDeg: 10, elevationDeg: 90 });
  });
});

describe('labels', () => {
  it('priority: focus > selection > Sun > planets > dwarf planets > moons; bigger first within a type', () => {
    const p = (t: string, r: number, f = false, s = false) => labelPriority(t, r, f, s);
    expect(p('moon', 10, true)).toBeLessThan(p('star', 695700));
    expect(p('moon', 10, false, true)).toBeLessThan(p('star', 695700));
    expect(p('star', 695700)).toBeLessThan(p('planet', 69911));
    expect(p('planet', 2439)).toBeLessThan(p('dwarf-planet', 1188));
    expect(p('dwarf-planet', 1188)).toBeLessThan(p('moon', 2634));
    expect(p('planet', 69911)).toBeLessThan(p('planet', 2439));
  });

  it('fade by distance relative to the view scale', () => {
    expect(distanceFade(1e6, 1e4)).toBe(1); // 100×
    expect(distanceFade(3e7, 1e4)).toBe(0); // 3000×
    expect(distanceFade(Math.sqrt(300 * 3000) * 1e4, 1e4)).toBeCloseTo(0.5, 9);
  });

  it('culls lower-priority overlapping labels, keeps separate ones', () => {
    const shown = cullOverlaps([
      { id: 'moon', x: 100, y: 100, width: 40, height: 16, priority: 3 },
      { id: 'earth', x: 105, y: 104, width: 40, height: 16, priority: 1 },
      { id: 'mars', x: 300, y: 100, width: 40, height: 16, priority: 1 },
    ]);
    expect([...shown].sort()).toEqual(['earth', 'mars']);
  });
});

describe('formatting', () => {
  it('distances, radii and durations', () => {
    expect(formatKm(6371)).toBe('6,371 km');
    expect(formatKm(11.05)).toBe('11.1 km');
    expect(formatDistance(384400)).toBe('384,400 km · 1.3 light-seconds');
    expect(formatDistance(149_597_870.7)).toBe('1.000 AU · 149.6 million km · 8.3 light-minutes');
    expect(formatDistance(4.5e9)).toMatch(/^30\.081 AU · 4\.50 billion km · 4\.17 light-hours$/);
    expect(formatDays(0.99727)).toBe('23.9 hours');
    expect(formatDays(58.646)).toBe('58.6 days');
    expect(formatDays(4332.6)).toBe('11.86 years (4,333 days)');
    expect(formatDays(Infinity)).toBe('—');
  });

  it('type labels', () => {
    expect(typeLabel('moon', 'Mars')).toBe('Moon of Mars');
    expect(typeLabel('dwarf-planet', null)).toBe('Dwarf planet');
  });
});
