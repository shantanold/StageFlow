/**
 * Optional times of day for a job's two visits: staging (install, on
 * start_date) and destage (pickup, on destaged_at or expected_end_date).
 *
 * Stored as wall-clock "HH:MM" strings read in the org's time zone, separate
 * from the date-only job dates. Moving a job's date keeps its time, and
 * Google Calendar gets the time plus the zone name so daylight saving is
 * handled correctly. No start time means the visit is all day; no end time
 * means it lasts DEFAULT_VISIT_MINUTES.
 */

export const DEFAULT_VISIT_MINUTES = 120;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const VISITS = ["stage", "destage"] as const;
export type Visit = (typeof VISITS)[number];

type TimeFields = {
  stage_start_time: string | null;
  stage_end_time: string | null;
  destage_start_time: string | null;
  destage_end_time: string | null;
};

const LABEL: Record<Visit, string> = { stage: "Staging", destage: "Destage" };

function minutes(t: string) {
  const [, h, m] = TIME_RE.exec(t)!;
  return Number(h) * 60 + Number(m);
}

/**
 * Validates the time fields present in a create/update body against the
 * job's current values (none on create). Returns the columns to write, or
 * an error message. Clearing a start time clears its end time too.
 */
export function resolveVisitTimes(
  body: Record<string, unknown>,
  existing?: Partial<TimeFields>
): { data: Partial<TimeFields> } | { error: string } {
  const data: Partial<TimeFields> = {};
  for (const visit of VISITS) {
    const startKey = `${visit}_start_time` as const;
    const endKey = `${visit}_end_time` as const;
    if (body[startKey] === undefined && body[endKey] === undefined) continue;

    const read = (key: typeof startKey | typeof endKey): string | null | { error: string } => {
      const v = body[key];
      if (v === undefined) return existing?.[key] ?? null;
      if (v === null || v === "") return null;
      if (typeof v !== "string" || !TIME_RE.test(v.trim())) return { error: `${key} must be a time like 09:30` };
      return v.trim();
    };
    const start = read(startKey);
    const end = read(endKey);
    if (start && typeof start === "object") return start;
    if (end && typeof end === "object") return end;

    if (!start) {
      if (end && body[endKey] !== undefined) return { error: `Set a ${LABEL[visit].toLowerCase()} start time before an end time` };
      data[startKey] = null;
      data[endKey] = null;
      continue;
    }
    if (end && minutes(end) <= minutes(start)) {
      return { error: `${LABEL[visit]} end time must be after its start time` };
    }
    data[startKey] = start;
    data[endKey] = end;
  }
  return { data };
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function localDateTime(day: string, totalMinutes: number) {
  const dayOffset = Math.floor(totalMinutes / 1440);
  const m = totalMinutes % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${addDays(day, dayOffset)}T${hh}:${mm}:00`;
}

/**
 * The visit's local start and end ("yyyy-MM-ddTHH:mm:00", no offset: read
 * in the org's time zone), or null when it's all day. A default-length visit
 * starting late at night may end the next day.
 */
export function visitWindow(day: string, start: string | null, end: string | null) {
  if (!start) return null;
  const s = minutes(start);
  const e = end ? minutes(end) : s + DEFAULT_VISIT_MINUTES;
  return { start: localDateTime(day, s), end: localDateTime(day, e) };
}
