// View logic for the B2 screens. Mirrors the iOS app's HomeLogic / JobsLogic
// (ViewLogic.swift) so both clients say the same things.

import type { Job } from "../types";

/** A date-only field (UTC midnight of the chosen day) as local midnight of that day. */
export function localDay(calendarDay: string): Date {
  const d = new Date(calendarDay);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** "FRIDAY, NOVEMBER 6" for the Home band's date line. */
export function todayLine(today = new Date()): string {
  return today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
}


/** Date tile: "TODAY" for today, weekday for the next six days, else the month. */
export function dateTile(day: Date, today = new Date()): { top: string; number: string; isToday: boolean } {
  const offset = daysBetween(today, day);
  const number = String(day.getDate());
  if (offset === 0) return { top: "TODAY", number, isToday: true };
  const top = offset > 0 && offset < 7
    ? day.toLocaleDateString("en-US", { weekday: "short" })
    : day.toLocaleDateString("en-US", { month: "short" });
  return { top: top.toUpperCase(), number, isToday: false };
}

function shortDay(d: Date, weekday: boolean): string {
  return d.toLocaleDateString("en-US", weekday ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" });
}

export type NextStepTone = "upcoming" | "soon" | "overdue" | "done";

/** What a job needs next, in the words shown on its card. */
export function nextStep(job: Job, today = new Date()): { text: string; tone: NextStepTone } | null {
  switch (job.status) {
    case "planning": {
      const start = localDay(job.start_date);
      const offset = daysBetween(today, start);
      const date = shortDay(start, true);
      if (offset < 0) return { text: `Install was due ${date}`, tone: "overdue" };
      if (offset === 0) return { text: "Install today", tone: "soon" };
      return { text: `Install ${date}`, tone: offset <= 7 ? "soon" : "upcoming" };
    }
    case "active": {
      const end = localDay(job.expected_end_date);
      const offset = daysBetween(today, end);
      const date = shortDay(end, false);
      if (offset < 0) return { text: `Pickup overdue since ${date}`, tone: "overdue" };
      if (offset === 0) return { text: "Pickup today", tone: "soon" };
      return { text: `Pickup ${date} · ${offset === 1 ? "1 day" : `${offset} days`}`, tone: offset <= 7 ? "soon" : "upcoming" };
    }
    case "completed": {
      const ended = job.actual_end_date ?? job.destaged_at;
      return { text: ended ? `Destaged ${shortDay(new Date(ended), false)}` : "Completed", tone: "done" };
    }
    default:
      return null;
  }
}

export function nextStepColor(tone: NextStepTone): string {
  switch (tone) {
    case "overdue": return "var(--red-text)";
    case "soon": return "var(--amber-text)";
    case "done": return "var(--green-text)";
    default: return "var(--ink-secondary)";
  }
}
