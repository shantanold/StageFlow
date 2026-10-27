import ICAL from "ical.js";
import { isValidTimeZone, zonedTimeToUtc } from "./timezone";

/**
 * Parses iCalendar (.ics) text — what Apple Calendar, Google Calendar and
 * Outlook export or publish — into plain events with real start/end instants.
 *
 * Repeating events are expanded into one event per occurrence inside the
 * import window, each with a stable `external_uid` (UID + original start) so a
 * re-import updates rather than duplicates. All-day events become UTC midnight
 * of their first day and of the day after their last (end exclusive).
 */

export interface ParsedEvent {
  external_uid: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  is_busy: boolean;
}

export interface ParseOptions {
  /** Only occurrences overlapping [windowStart, windowEnd) are returned. */
  windowStart: Date;
  windowEnd: Date;
  /** Zone for floating times and TZIDs we can't resolve (the org's time zone). */
  fallbackTimeZone: string;
  /** Hard cap on returned events. */
  maxEvents?: number;
}

export class IcsParseError extends Error {}

const MAX_OCCURRENCES_PER_EVENT = 1000;
/** Bounds work on rules like FREQ=MINUTELY that never reach the window. */
const MAX_ITERATIONS_PER_EVENT = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function clip(s: string | null | undefined, max: number): string | null {
  const t = (s ?? "").trim();
  return t ? t.slice(0, max) : null;
}

/** Default window: 90 days back, one year ahead. */
export function defaultImportWindow(now = new Date()) {
  return {
    windowStart: new Date(now.getTime() - 90 * DAY_MS),
    windowEnd: new Date(now.getTime() + 365 * DAY_MS),
  };
}

export function parseIcs(text: string, opts: ParseOptions): ParsedEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch (err) {
    throw new IcsParseError(`Not a valid calendar file: ${(err as Error).message}`);
  }
  if (root.name !== "vcalendar") throw new IcsParseError("Not a valid calendar file: missing VCALENDAR");

  // VTIMEZONE blocks are resolved locally rather than registered in ical.js's
  // global TimezoneService, so one org's file can't affect another's import.
  const localZones = new Map<string, ICAL.Timezone>();
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    const tz = new ICAL.Timezone(vtz);
    if (tz.tzid) localZones.set(tz.tzid, tz);
  }

  const calendarTz = root.getFirstPropertyValue("x-wr-timezone");
  const fallbackTz =
    typeof calendarTz === "string" && isValidTimeZone(calendarTz) ? calendarTz : opts.fallbackTimeZone;

  const instant = (t: ICAL.Time, tzid: string | null): number => {
    if (t.zone === ICAL.Timezone.utcTimezone || t.zone?.tzid === "UTC") {
      return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
    }
    const wall = { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second };
    if (tzid && isValidTimeZone(tzid)) return zonedTimeToUtc(wall, tzid).getTime();
    const local = tzid ? localZones.get(tzid) : undefined;
    if (local) {
      const c = t.clone();
      c.zone = local;
      return c.toUnixTime() * 1000;
    }
    return zonedTimeToUtc(wall, fallbackTz).getTime();
  };

  const dayStart = (t: ICAL.Time) => Date.UTC(t.year, t.month - 1, t.day);

  const tzidOf = (comp: ICAL.Component, name: string): string | null => {
    const p = comp.getFirstProperty(name);
    const v = p?.getParameter("tzid");
    return typeof v === "string" ? v : null;
  };

  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const comp of vevents) {
    const ev = new ICAL.Event(comp);
    if (!ev.uid || !ev.startDate) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  // Moved/edited single occurrences (RECURRENCE-ID) attach to their series;
  // orphans are imported as standalone events.
  const orphans: ICAL.Event[] = [];
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master && master.isRecurring()) master.relateException(ex);
    else orphans.push(ex);
  }

  const winStart = opts.windowStart.getTime();
  const winEnd = opts.windowEnd.getTime();
  const maxEvents = opts.maxEvents ?? 5000;
  const out: ParsedEvent[] = [];

  const isCancelled = (ev: ICAL.Event) =>
    String(ev.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

  /** Converts one occurrence and keeps it if it overlaps the window. */
  const emit = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null, uid: string): boolean => {
    if (isCancelled(ev)) return true;
    const allDay = start.isDate;
    let s: number;
    let e: number;
    if (allDay) {
      s = dayStart(start);
      e = end ? dayStart(end) : s + DAY_MS;
      if (e <= s) e = s + DAY_MS;
    } else {
      s = instant(start, tzidOf(ev.component, "dtstart"));
      e = end ? instant(end, tzidOf(ev.component, "dtend") ?? tzidOf(ev.component, "dtstart")) : s;
      if (e < s) e = s;
    }
    if (e <= winStart && s < winStart) return true;
    if (s >= winEnd) return true;
    out.push({
      external_uid: uid.slice(0, 1000),
      title: clip(ev.summary, 500) ?? "(No title)",
      description: clip(ev.description, 5000),
      location: clip(ev.location, 500),
      start_at: new Date(s),
      end_at: new Date(e),
      all_day: allDay,
      is_busy: String(ev.component.getFirstPropertyValue("transp") ?? "").toUpperCase() !== "TRANSPARENT",
    });
    return out.length < maxEvents;
  };

  const occurrenceKey = (ev: ICAL.Event, t: ICAL.Time) =>
    t.isDate
      ? `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`
      : new Date(instant(t, tzidOf(ev.component, "dtstart"))).toISOString();

  for (const ev of masters.values()) {
    if (out.length >= maxEvents) break;
    if (!ev.isRecurring()) {
      if (!emit(ev, ev.startDate, ev.endDate, ev.uid)) break;
      continue;
    }
    const it = ev.iterator();
    let kept = 0;
    for (let i = 0; i < MAX_ITERATIONS_PER_EVENT && kept < MAX_OCCURRENCES_PER_EVENT; i++) {
      const next = it.next();
      if (!next) break;
      // Rough stop: once the original start is well past the window, later ones are too.
      if (!next.isDate && instant(next, tzidOf(ev.component, "dtstart")) >= winEnd + DAY_MS) break;
      if (next.isDate && dayStart(next) >= winEnd + DAY_MS) break;
      const details = ev.getOccurrenceDetails(next);
      const before = out.length;
      const cont = emit(details.item, details.startDate, details.endDate, `${ev.uid}#${occurrenceKey(ev, next)}`);
      if (out.length > before) kept++;
      if (!cont) break;
    }
  }

  for (const ev of orphans) {
    if (out.length >= maxEvents) break;
    emit(ev, ev.startDate, ev.endDate, `${ev.uid}#${occurrenceKey(ev, ev.recurrenceId)}`);
  }

  return out;
}
