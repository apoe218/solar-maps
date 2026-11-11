import { DAYS_PER_CENTURY, J2000_JD } from './constants';

/** Julian Date of the Unix epoch, 1970-01-01T00:00Z. */
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86_400_000;

// TDB is treated as UTC throughout (difference ~69 s — negligible here).

export function dateToJulianDate(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

export function julianDateToDate(jd: number): Date {
  return new Date(Math.round((jd - UNIX_EPOCH_JD) * MS_PER_DAY));
}

export function daysSinceJ2000(jd: number): number {
  return jd - J2000_JD;
}

/** Julian centuries since J2000 (Standish's T). */
export function centuriesSinceJ2000(jd: number): number {
  return (jd - J2000_JD) / DAYS_PER_CENTURY;
}
