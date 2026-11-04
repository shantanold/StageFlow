import type { CalendarEvent, Job } from "../types";
import { localDateInputValue } from "./utils";

/**
 * Pure helpers for the Schedule page: which day each event or job date lands
 * on, and converting between the event form's local inputs and API instants.
 *
 * Day keys are "yyyy-MM-dd" for the viewer's local day. Timed events are
 * placed by local time; all-day events and job dates are calendar days (UTC
 * midnight from the server) and are placed by their UTC date so they never
 * shift a day for viewers west of UTC.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type ScheduleEntry =
  | { kind: "event"; key: string; event: CalendarEvent; sortKey: number }
  | { kind: "job"; key: string; job: Job; milestone: "install" | "pickup"; sortKey: number };

/** Local midnight of the day containing `d`. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addLocalDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Sunday-first week containing `d`. */
export function startOfWeek(d: Date): Date {
  const day = startOfLocalDay(d);
  return addLocalDays(day, -day.getDay());
}

export function dayKey(d: Date): string {
  return localDateInputValue(d);
}

/** The local Date for a "yyyy-MM-dd" key. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function utcDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Every day key an event covers (end exclusive). */
export function eventDayKeys(ev: CalendarEvent): string[] {
  const start = new Date(ev.start_at).getTime();
  const end = new Date(ev.end_at).getTime();
  const keys: string[] = [];
  if (ev.all_day) {
    for (let t = start; t < Math.max(end, start + 1); t += DAY_MS) keys.push(utcDayKey(t));
    return keys;
  }
  const last = startOfLocalDay(new Date(Math.max(start, end - 1)));
  for (let d = startOfLocalDay(new Date(start)); d <= last; d = addLocalDays(d, 1)) keys.push(dayKey(d));
  return keys;
}

/**
 * Groups events and job install/pickup days by day key. Within a day: job
 * dates and all-day events first, then timed events by start time.
 */
export function buildSchedule(events: CalendarEvent[], jobs: Job[]): Map<string, ScheduleEntry[]> {
  const byDay = new Map<string, ScheduleEntry[]>();
  const add = (key: string, entry: ScheduleEntry) => {
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  };

  for (const job of jobs) {
    if (job.status === "cancelled") continue;
    add(job.start_date.slice(0, 10), { kind: "job", key: `${job.id}-install`, job, milestone: "install", sortKey: -2 });
    const end = job.actual_end_date ?? job.expected_end_date;
    add(end.slice(0, 10), { kind: "job", key: `${job.id}-pickup`, job, milestone: "pickup", sortKey: -2 });
  }
  for (const ev of events) {
    const sortKey = ev.all_day ? -1 : new Date(ev.start_at).getTime();
    for (const key of eventDayKeys(ev)) add(key, { kind: "event", key: `${ev.id}-${key}`, event: ev, sortKey });
  }
  for (const list of byDay.values()) list.sort((a, b) => a.sortKey - b.sortKey);
  return byDay;
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "9:00 AM – 10:30 AM", or "All day"; marks the parts of multi-day events. */
export function eventTimeLabel(ev: CalendarEvent, onDay: string): string {
  if (ev.all_day) return "All day";
  const keys = eventDayKeys(ev);
  const first = keys[0] === onDay;
  const last = keys[keys.length - 1] === onDay;
  if (ev.start_at === ev.end_at) return formatTime(ev.start_at);
  if (first && last) return `${formatTime(ev.start_at)} – ${formatTime(ev.end_at)}`;
  if (first) return `From ${formatTime(ev.start_at)}`;
  if (last) return `Until ${formatTime(ev.end_at)}`;
  return "All day";
}

// ─── Event form <-> API ─────────────────────────────────────────────────────

export interface EventFormTimes {
  allDay: boolean;
  /** yyyy-MM-dd */
  startDate: string;
  /** yyyy-MM-dd; inclusive last day for all-day events */
  endDate: string;
  /** HH:mm (local), ignored for all-day */
  startTime: string;
  endTime: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function formTimesFromEvent(ev: CalendarEvent): EventFormTimes {
  const start = new Date(ev.start_at);
  const end = new Date(ev.end_at);
  if (ev.all_day) {
    return {
      allDay: true,
      startDate: utcDayKey(start.getTime()),
      endDate: utcDayKey(Math.max(start.getTime(), end.getTime() - DAY_MS)),
      startTime: "09:00",
      endTime: "10:00",
    };
  }
  return {
    allDay: false,
    startDate: dayKey(start),
    endDate: dayKey(end),
    startTime: localTime(start),
    endTime: localTime(end),
  };
}

export function defaultFormTimes(day: string): EventFormTimes {
  return { allDay: false, startDate: day, endDate: day, startTime: "09:00", endTime: "10:00" };
}

/** API start/end instants for the form, or an error message. */
export function formTimesToApi(t: EventFormTimes): { start_at: string; end_at: string } | string {
  if (!t.startDate) return "Pick a date";
  if (t.allDay) {
    const end = t.endDate || t.startDate;
    if (end < t.startDate) return "End date is before the start date";
    const endExclusive = new Date(Date.parse(`${end}T00:00:00Z`) + DAY_MS);
    return { start_at: `${t.startDate}T00:00:00.000Z`, end_at: endExclusive.toISOString() };
  }
  if (!t.startTime || !t.endTime) return "Pick a start and end time";
  const start = new Date(`${t.startDate}T${t.startTime}`);
  const end = new Date(`${t.endDate || t.startDate}T${t.endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Pick a valid date and time";
  if (end < start) return "End is before the start";
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

export function sourceLabel(ev: CalendarEvent): string | null {
  if (ev.source === "ics_url") return ev.calendar_source?.name ?? "Subscribed calendar";
  if (ev.source === "ics_file") return "Imported";
  return null;
}
