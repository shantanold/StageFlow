/**
 * Small IANA time-zone helpers built on Intl (no tz database dependency).
 * Used to place imported calendar times and working hours on real instants.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock fields of an instant as seen in `tz`. */
export function wallTimeIn(ts: number, tz: string): WallTime {
  const parts = Object.fromEntries(
    formatter(tz).formatToParts(new Date(ts)).map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Milliseconds `tz` is ahead of UTC at instant `ts`. */
function offsetAt(ts: number, tz: string): number {
  const w = wallTimeIn(ts, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/**
 * The instant at which clocks in `tz` read the given wall time. Times skipped
 * by a DST jump resolve to the later offset; repeated times to the first.
 */
export function zonedTimeToUtc(w: WallTime, tz: string): Date {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const o1 = offsetAt(guess, tz);
  const t1 = guess - o1;
  const o2 = offsetAt(t1, tz);
  if (o1 === o2) return new Date(t1);
  const t2 = guess - o2;
  // In a DST gap neither candidate reads back as the wall time; take the later one.
  return new Date(offsetAt(t2, tz) === o2 ? t2 : Math.max(t1, t2));
}

/** Adds whole calendar days to a y/m/d (month 1–12). */
export function addDays(y: number, m: number, d: number, days: number) {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}
