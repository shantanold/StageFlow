import { addDays, wallTimeIn, zonedTimeToUtc } from "./timezone";

/**
 * Free-slot finder for scheduling (the calendar page and, later, the voice
 * receptionist). Pure: callers load the busy intervals.
 */

export interface Interval {
  start: Date;
  end: Date;
}

export interface AvailabilityOptions {
  from: Date;
  to: Date;
  timeZone: string;
  /** Minutes after local midnight the working day starts / ends. */
  dayStartMinutes: number;
  dayEndMinutes: number;
  /** Working weekdays, 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
  durationMinutes: number;
  /** Candidate start times fall on this local-time grid. */
  stepMinutes: number;
  maxSlots?: number;
}

const MIN = 60_000;

/** Sorts and merges overlapping or touching intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start.getTime() <= last.end.getTime()) {
      if (i.end.getTime() > last.end.getTime()) last.end = new Date(i.end.getTime());
    } else {
      out.push({ start: new Date(i.start.getTime()), end: new Date(i.end.getTime()) });
    }
  }
  return out;
}

export function findFreeSlots(busy: Interval[], opts: AvailabilityOptions): Interval[] {
  const merged = mergeIntervals(busy);
  const from = opts.from.getTime();
  const to = opts.to.getTime();
  const duration = opts.durationMinutes * MIN;
  const maxSlots = opts.maxSlots ?? 200;
  const slots: Interval[] = [];
  if (to <= from || duration <= 0 || opts.stepMinutes <= 0) return slots;

  const first = wallTimeIn(from, opts.timeZone);
  let day = { year: first.year, month: first.month, day: first.day };
  // Walk local calendar days until the day starts after `to`.
  for (let guard = 0; guard < 400; guard++, day = addDays(day.year, day.month, day.day, 1)) {
    const midnight = zonedTimeToUtc({ ...day, hour: 0, minute: 0, second: 0 }, opts.timeZone).getTime();
    if (midnight >= to) break;
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    if (!opts.workingDays.includes(weekday)) continue;

    const at = (minutes: number) =>
      zonedTimeToUtc(
        { ...day, hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0 },
        opts.timeZone
      ).getTime();
    const open = at(opts.dayStartMinutes);
    const close = at(opts.dayEndMinutes);

    for (let m = opts.dayStartMinutes; ; m += opts.stepMinutes) {
      const s = at(m);
      const e = s + duration;
      if (e > close || e > to) break;
      if (s < from || s < open) continue;
      const clash = merged.some((b) => b.start.getTime() < e && b.end.getTime() > s);
      if (!clash) {
        slots.push({ start: new Date(s), end: new Date(e) });
        if (slots.length >= maxSlots) return slots;
      }
    }
  }
  return slots;
}
