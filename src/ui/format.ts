/** Human-readable values for the info panel. Pure: no DOM. */
const AU_KM = 149_597_870.7;
const LIGHT_KM_S = 299_792.458;

const n = (x: number, digits = 0) => x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "6,371 km", "11.1 km" */
export function formatKm(km: number): string {
  return `${n(km, km < 100 ? 1 : 0)} km`;
}

/** Distance with the most useful units: "384,400 km (1.3 light-seconds)", "1.524 AU · 228.0 million km · 12.7 light-minutes". */
export function formatDistance(km: number): string {
  const lightS = km / LIGHT_KM_S;
  const light = lightS < 60 ? `${n(lightS, 1)} light-seconds` : lightS < 3600 ? `${n(lightS / 60, 1)} light-minutes` : `${n(lightS / 3600, 2)} light-hours`;
  if (km < 0.01 * AU_KM) return `${n(km)} km · ${light}`;
  const million = km >= 1e9 ? `${n(km / 1e9, 2)} billion km` : `${n(km / 1e6, 1)} million km`;
  return `${n(km / AU_KM, 3)} AU · ${million} · ${light}`;
}

/** Durations from hours to centuries: "23.9 hours", "58.6 days", "11.86 years (4,333 days)". */
export function formatDays(days: number): string {
  const d = Math.abs(days);
  if (!Number.isFinite(d)) return '—';
  if (d < 2) return `${n(d * 24, 1)} hours`;
  if (d < 400) return `${n(d, d < 10 ? 2 : 1)} days`;
  return `${n(d / 365.25, 2)} years (${n(d)} days)`;
}

export function typeLabel(type: string, parentName: string | null): string {
  switch (type) {
    case 'star': return 'Star';
    case 'planet': return 'Planet';
    case 'dwarf-planet': return 'Dwarf planet';
    case 'moon': return parentName ? `Moon of ${parentName}` : 'Moon';
    default: return type;
  }
}
