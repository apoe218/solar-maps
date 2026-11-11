/** IAU 2012 astronomical unit, km. */
export const AU_KM = 149_597_870.7;
/** Julian Date of the J2000.0 epoch (2000-01-01T12:00 TT). */
export const J2000_JD = 2451545.0;
export const DAYS_PER_CENTURY = 36525;
export const DAYS_PER_JULIAN_YEAR = 365.25;
/** Obliquity of the ecliptic at J2000 (IAU 1976), degrees — the angle Horizons uses for its J2000 ecliptic frame. */
export const OBLIQUITY_J2000_DEG = 23.4392911;

export const DEG = Math.PI / 180;
export const deg2rad = (d: number): number => d * DEG;
export const rad2deg = (r: number): number => r / DEG;

/** Wrap an angle in radians to [-π, π). */
export function wrapPi(x: number): number {
  const twoPi = 2 * Math.PI;
  return x - twoPi * Math.floor((x + Math.PI) / twoPi);
}
