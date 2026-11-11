import { dateToJulianDate, julianDateToDate } from '../ephemeris';

const DAY_S = 86_400;

export interface Speed {
  id: string;
  label: string;
  /** simulated seconds per real second */
  rate: number;
}

export const SPEEDS: readonly Speed[] = [
  { id: 'realtime', label: '1×', rate: 1 },
  { id: 'day', label: '1 day/s', rate: DAY_S },
  { id: 'month', label: '1 month/s', rate: (365.25 / 12) * DAY_S },
  { id: 'year', label: '1 yr/s', rate: 365.25 * DAY_S },
];

/** Range where the Standish Table 1 elements are valid (CLAUDE.md goals). */
export const ACCURATE_FROM_JD = dateToJulianDate(new Date('1800-01-01T00:00:00Z'));
export const ACCURATE_TO_JD = dateToJulianDate(new Date('2050-12-31T23:59:59Z'));

/** Longest real-time step applied in one tick, so a backgrounded tab doesn't leap centuries on return. */
export const MAX_TICK_SECONDS = 1;

/** Simulation clock: Julian Date (TDB ≈ UTC) advanced by real time × speed × direction. No DOM. */
export class SimClock {
  jd: number;
  playing = true;
  speedIndex = 0;
  direction: 1 | -1 = 1;

  constructor(start: Date = new Date()) {
    this.jd = dateToJulianDate(start);
  }

  get speed(): Speed {
    return SPEEDS[this.speedIndex]!;
  }

  get date(): Date {
    return julianDateToDate(this.jd);
  }

  get isAccurate(): boolean {
    return this.jd >= ACCURATE_FROM_JD && this.jd <= ACCURATE_TO_JD;
  }

  /** Advance by `realSeconds` of wall-clock time. */
  tick(realSeconds: number): void {
    if (!this.playing) return;
    const dt = Math.min(Math.max(realSeconds, 0), MAX_TICK_SECONDS);
    this.jd += (this.direction * this.speed.rate * dt) / DAY_S;
  }

  togglePlay(): void {
    this.playing = !this.playing;
  }

  reverse(): void {
    this.direction = this.direction === 1 ? -1 : 1;
  }

  setSpeed(id: string): void {
    const i = SPEEDS.findIndex((s) => s.id === id);
    if (i < 0) throw new Error(`Unknown speed "${id}"`);
    this.speedIndex = i;
  }

  /** Jump to the current wall-clock time. */
  setNow(now: Date = new Date()): void {
    this.jd = dateToJulianDate(now);
  }
}

/** "2026-11-11 22:35:07 UTC" */
export function formatUtc(date: Date): string {
  if (Number.isNaN(date.getTime())) return 'out of range';
  const iso = date.toISOString(); // years outside 0000–9999 use ±YYYYYY, still fine
  return `${iso.slice(0, -14)} ${iso.slice(-13, -5)} UTC`;
}
