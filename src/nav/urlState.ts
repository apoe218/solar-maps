/**
 * Shareable view state in the URL hash, e.g. `#body=mars&dist=20000km&view=35,20&t=2026-11-11T08:30Z`.
 * Pure: no DOM. `dist` is from the body's centre; `view` is the camera's azimuth,elevation (degrees,
 * world axes) around the body; `t` is omitted while the clock is live (following real time).
 */
export interface ViewState {
  body: string;
  distKm?: number;
  view?: { azimuthDeg: number; elevationDeg: number };
  time?: Date;
}

const AU_KM = 149_597_870.7;

/** "20000km", "2.8AU", "450m", or a bare number (km). Returns km, or null if invalid. */
export function parseDistance(s: string): number | null {
  const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*(km|au|m)?\s*$/i.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  const unit = (m[2] ?? 'km').toLowerCase();
  const km = unit === 'au' ? v * AU_KM : unit === 'm' ? v / 1000 : v;
  return Number.isFinite(km) && km > 0 ? km : null;
}

/** 3 significant figures: metres below 1 km, AU from 0.1 AU, km otherwise. */
export function formatDistanceParam(km: number): string {
  const sig = (x: number) => Number(x.toPrecision(3)).toString();
  if (km < 1) return `${sig(km * 1000)}m`;
  if (km >= 0.1 * AU_KM) return `${sig(km / AU_KM)}AU`;
  return `${sig(km)}km`;
}

/** "2026-11-11" (00:00 UTC), "2026-11-11T08:30Z", "2026-11-11T08:30:15Z", or any ISO date-time. */
export function parseTime(s: string): Date | null {
  const t = s.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00Z` : /T\d{2}:\d{2}Z$/i.test(t) ? t.replace(/Z$/i, ':00Z') : t;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Minute precision; just the date at midnight UTC. */
export function formatTime(d: Date): string {
  const iso = d.toISOString();
  if (iso.endsWith('T00:00:00.000Z')) return iso.slice(0, 10);
  return `${iso.slice(0, 16)}Z`;
}

export function parseHash(hash: string): Partial<ViewState> {
  const out: Partial<ViewState> = {};
  for (const part of hash.replace(/^#/, '').split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    if (key === 'body' && /^[a-z0-9-]+$/i.test(value)) out.body = value.toLowerCase();
    else if (key === 'dist') {
      const km = parseDistance(value);
      if (km !== null) out.distKm = km;
    } else if (key === 'view') {
      const [az, el] = value.split(',').map(Number);
      if (Number.isFinite(az) && Number.isFinite(el)) out.view = { azimuthDeg: az!, elevationDeg: Math.max(-90, Math.min(90, el!)) };
    } else if (key === 't') {
      const d = parseTime(value);
      if (d) out.time = d;
    }
  }
  return out;
}

export function formatHash(s: ViewState): string {
  const parts = [`body=${encodeURIComponent(s.body)}`];
  if (s.distKm !== undefined) parts.push(`dist=${formatDistanceParam(s.distKm)}`);
  if (s.view) parts.push(`view=${Math.round(s.view.azimuthDeg)},${Math.round(s.view.elevationDeg)}`);
  if (s.time) parts.push(`t=${formatTime(s.time)}`);
  return `#${parts.join('&')}`;
}
