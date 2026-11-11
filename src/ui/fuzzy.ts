/** Fuzzy matching for the search box. Pure: no DOM. */

export interface SearchEntry {
  id: string;
  name: string;
  aliases: readonly string[];
  /** lower = more important (Sun 0, planets 1, dwarf planets 2, moons 3); breaks ties */
  rank: number;
}

export interface SearchHit {
  id: string;
  score: number;
  /** the alias that matched, when it wasn't the name ("Luna" for the Moon) */
  alias: string | null;
}

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Match quality tier for one candidate string against a normalised query (0 = no match):
 * exact 1000 > prefix 900 > word prefix 800 > substring 700 > typo 650/550 > letters in order 300.
 * Within a tier, `search` prefers more important bodies, then shorter names.
 */
export function scoreString(candidate: string, q: string): number {
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (c === q) return 1000;
  if (c.startsWith(q)) return 900;
  const words = c.split(' ');
  if (words.some((w) => w.startsWith(q))) return 800;
  if (c.includes(q)) return 700;
  // Typos: compare with each word (and its same-length prefix) — "jupitr", "satrun", "plto".
  if (q.length >= 3) {
    const allowed = q.length >= 6 ? 2 : 1;
    let best = Infinity;
    for (const w of [c, ...words]) best = Math.min(best, editDistance(q, w), editDistance(q, w.slice(0, q.length)));
    if (best <= allowed) return 650 - 100 * best;
  }
  // Letters in order with gaps ("nptn"): weakest.
  let i = 0;
  for (const ch of c) if (ch === q[i]) i++;
  if (i === q.length && q.length >= 2) return 300;
  return 0;
}

/**
 * Best matches for `query`, best first. Name matches beat alias matches slightly; ties go to more
 * important bodies, then shorter names, then alphabetical. An empty query lists everything by importance (browsing).
 */
export function search(entries: readonly SearchEntry[], query: string, limit = 8): SearchHit[] {
  const q = normalize(query);
  const hits: SearchHit[] = [];
  for (const e of entries) {
    if (!q) {
      hits.push({ id: e.id, score: 1, alias: null });
      continue;
    }
    let best = scoreString(e.name, q);
    let alias: string | null = null;
    for (const a of e.aliases) {
      const s = scoreString(a, q) - 5;
      if (s > best) {
        best = s;
        alias = a;
      }
    }
    if (best > 0) hits.push({ id: e.id, score: best, alias });
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  hits.sort((a, b) => {
    const ea = byId.get(a.id)!, eb = byId.get(b.id)!;
    return b.score - a.score || ea.rank - eb.rank || ea.name.length - eb.name.length || ea.name.localeCompare(eb.name);
  });
  return hits.slice(0, limit);
}
