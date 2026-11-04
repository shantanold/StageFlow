import { describe, it, expect } from "vitest";
import { parseIcs, IcsParseError } from "../src/lib/ics";
import { findFreeSlots, mergeIntervals } from "../src/lib/availability";
import { zonedTimeToUtc, wallTimeIn } from "../src/lib/timezone";
import { isPrivateAddress, normalizeFeedUrl } from "../src/lib/icsFetch";

const window = {
  windowStart: new Date("2026-01-01T00:00:00Z"),
  windowEnd: new Date("2027-01-01T00:00:00Z"),
  fallbackTimeZone: "America/Chicago",
};

function cal(...lines: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...lines, "END:VCALENDAR"].join("\r\n");
}

describe("timezone helpers", () => {
  it("converts wall time to UTC across DST", () => {
    // Chicago: CST (UTC-6) in January, CDT (UTC-5) in July.
    expect(zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 9, minute: 0, second: 0 }, "America/Chicago").toISOString())
      .toBe("2026-01-15T15:00:00.000Z");
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 9, minute: 0, second: 0 }, "America/Chicago").toISOString())
      .toBe("2026-07-15T14:00:00.000Z");
  });

  it("resolves a time skipped by spring-forward to the later offset", () => {
    // 2026-03-08 02:30 doesn't exist in Chicago; clocks jump 02:00 → 03:00.
    const d = zonedTimeToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, "America/Chicago");
    expect(d.toISOString()).toBe("2026-03-08T08:30:00.000Z");
    expect(wallTimeIn(d.getTime(), "America/Chicago").hour).toBe(3);
  });
});

describe("parseIcs", () => {
  it("parses timed events with TZID, UTC and floating times", () => {
    const events = parseIcs(
      cal(
        "BEGIN:VEVENT", "UID:a@test", "SUMMARY:Install at 12 Oak", "LOCATION:12 Oak St",
        "DTSTART;TZID=America/New_York:20260310T090000", "DTEND;TZID=America/New_York:20260310T103000", "END:VEVENT",
        "BEGIN:VEVENT", "UID:b@test", "SUMMARY:UTC call", "DTSTART:20260311T150000Z", "DTEND:20260311T153000Z", "END:VEVENT",
        "BEGIN:VEVENT", "UID:c@test", "SUMMARY:Floating", "DTSTART:20260312T080000", "DURATION:PT1H", "END:VEVENT",
      ),
      window
    );
    const byUid = Object.fromEntries(events.map((e) => [e.external_uid, e]));
    expect(byUid["a@test"].start_at.toISOString()).toBe("2026-03-10T13:00:00.000Z"); // EDT
    expect(byUid["a@test"].end_at.toISOString()).toBe("2026-03-10T14:30:00.000Z");
    expect(byUid["a@test"].location).toBe("12 Oak St");
    expect(byUid["b@test"].start_at.toISOString()).toBe("2026-03-11T15:00:00.000Z");
    // Floating time falls back to the org's zone (Chicago, CDT on Mar 12).
    expect(byUid["c@test"].start_at.toISOString()).toBe("2026-03-12T13:00:00.000Z");
    expect(byUid["c@test"].end_at.toISOString()).toBe("2026-03-12T14:00:00.000Z");
  });

  it("stores all-day events as UTC midnight with an exclusive end", () => {
    const [ev] = parseIcs(
      cal("BEGIN:VEVENT", "UID:d@test", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20260704",
        "DTEND;VALUE=DATE:20260705", "TRANSP:TRANSPARENT", "END:VEVENT"),
      window
    );
    expect(ev.all_day).toBe(true);
    expect(ev.start_at.toISOString()).toBe("2026-07-04T00:00:00.000Z");
    expect(ev.end_at.toISOString()).toBe("2026-07-05T00:00:00.000Z");
    expect(ev.is_busy).toBe(false);
  });

  it("uses a VTIMEZONE block for non-IANA zone names", () => {
    const [ev] = parseIcs(
      cal(
        "BEGIN:VTIMEZONE", "TZID:Custom Eastern",
        "BEGIN:STANDARD", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
        "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "END:STANDARD",
        "BEGIN:DAYLIGHT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
        "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "END:DAYLIGHT",
        "END:VTIMEZONE",
        "BEGIN:VEVENT", "UID:e@test", "SUMMARY:Meeting", "DTSTART;TZID=Custom Eastern:20260115T090000",
        "DTEND;TZID=Custom Eastern:20260115T100000", "END:VEVENT",
      ),
      window
    );
    expect(ev.start_at.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("expands repeating events with exceptions, overrides and cancellations", () => {
    const events = parseIcs(
      cal(
        "BEGIN:VEVENT", "UID:weekly@test", "SUMMARY:Team sync",
        "DTSTART;TZID=America/Chicago:20260105T100000", "DTEND;TZID=America/Chicago:20260105T110000",
        "RRULE:FREQ=WEEKLY;COUNT=5", "EXDATE;TZID=America/Chicago:20260112T100000", "END:VEVENT",
        // The Jan 19 occurrence moved to 2pm.
        "BEGIN:VEVENT", "UID:weekly@test", "SUMMARY:Team sync (moved)",
        "RECURRENCE-ID;TZID=America/Chicago:20260119T100000",
        "DTSTART;TZID=America/Chicago:20260119T140000", "DTEND;TZID=America/Chicago:20260119T150000", "END:VEVENT",
        // The Jan 26 occurrence was cancelled.
        "BEGIN:VEVENT", "UID:weekly@test", "STATUS:CANCELLED",
        "RECURRENCE-ID;TZID=America/Chicago:20260126T100000",
        "DTSTART;TZID=America/Chicago:20260126T100000", "DTEND;TZID=America/Chicago:20260126T110000", "END:VEVENT",
      ),
      window
    );
    expect(events.map((e) => e.start_at.toISOString())).toEqual([
      "2026-01-05T16:00:00.000Z",
      "2026-01-19T20:00:00.000Z",
      "2026-02-02T16:00:00.000Z",
    ]);
    expect(events[1].title).toBe("Team sync (moved)");
    // Keyed by the original start, so moving an occurrence keeps its id stable.
    expect(events[1].external_uid).toBe("weekly@test#2026-01-19T16:00:00.000Z");
    expect(new Set(events.map((e) => e.external_uid)).size).toBe(3);
  });

  it("only returns occurrences inside the window", () => {
    const events = parseIcs(
      cal("BEGIN:VEVENT", "UID:daily@test", "SUMMARY:Standup", "DTSTART:20200101T150000Z",
        "DTEND:20200101T151500Z", "RRULE:FREQ=DAILY", "END:VEVENT",
        "BEGIN:VEVENT", "UID:old@test", "SUMMARY:Old", "DTSTART:20200101T150000Z", "END:VEVENT"),
      { ...window, windowStart: new Date("2026-03-01T00:00:00Z"), windowEnd: new Date("2026-03-08T00:00:00Z") }
    );
    expect(events).toHaveLength(7);
    expect(events.every((e) => e.title === "Standup")).toBe(true);
  });

  it("rejects text that isn't a calendar", () => {
    expect(() => parseIcs("hello world", window)).toThrow(IcsParseError);
  });
});

describe("findFreeSlots", () => {
  const base = {
    timeZone: "America/Chicago",
    dayStartMinutes: 9 * 60,
    dayEndMinutes: 12 * 60,
    workingDays: [1, 2, 3, 4, 5],
    durationMinutes: 60,
    stepMinutes: 60,
  };

  it("finds working-hour slots around busy time in the org's zone", () => {
    // Mon 2026-03-16; 9–12 Chicago = 14:00–17:00Z. Busy 10:00–10:30 local.
    const slots = findFreeSlots(
      [{ start: new Date("2026-03-16T15:00:00Z"), end: new Date("2026-03-16T15:30:00Z") }],
      { ...base, from: new Date("2026-03-16T05:00:00Z"), to: new Date("2026-03-17T05:00:00Z") }
    );
    expect(slots.map((s) => s.start.toISOString())).toEqual(["2026-03-16T14:00:00.000Z", "2026-03-16T16:00:00.000Z"]);
  });

  it("skips non-working days", () => {
    // Sat 2026-03-14 and Sun 2026-03-15.
    const slots = findFreeSlots([], { ...base, from: new Date("2026-03-14T05:00:00Z"), to: new Date("2026-03-16T05:00:00Z") });
    expect(slots).toEqual([]);
  });

  it("merges overlapping busy intervals", () => {
    const merged = mergeIntervals([
      { start: new Date(3000), end: new Date(5000) },
      { start: new Date(1000), end: new Date(3000) },
      { start: new Date(7000), end: new Date(8000) },
    ]);
    expect(merged.map((m) => [m.start.getTime(), m.end.getTime()])).toEqual([[1000, 5000], [7000, 8000]]);
  });
});

describe("feed URL safety", () => {
  it("turns webcal links into https", () => {
    expect(normalizeFeedUrl("webcal://p01-caldav.icloud.com/published/2/abc")).toBe(
      "https://p01-caldav.icloud.com/published/2/abc"
    );
    expect(() => normalizeFeedUrl("ftp://example.com/cal.ics")).toThrow();
  });

  it("flags private and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "17.253.144.10", "2607:f8b0:4004:c07::64"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});
