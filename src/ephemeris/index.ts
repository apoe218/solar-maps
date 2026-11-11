// Pure orbital math (AU, days since J2000). No Three.js imports allowed here.

/** Days since J2000.0 (2000-01-01T12:00:00Z) for a JS Date (TDB ≈ UTC). */
export function daysSinceJ2000(date: Date): number {
  const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
  return (date.getTime() - J2000_MS) / 86_400_000;
}
