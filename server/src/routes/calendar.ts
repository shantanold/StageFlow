import express, { Router, type Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";
import { defaultImportWindow, IcsParseError, parseIcs } from "../lib/ics";
import { IcsFetchError, normalizeFeedUrl } from "../lib/icsFetch";
import { syncCalendarSource, upsertImportedEvents } from "../lib/calendarSync";
import { findFreeSlots } from "../lib/availability";
import { isValidTimeZone } from "../lib/timezone";

const router = Router();
router.use(authenticate);

const DAY_MS = 24 * 60 * 60 * 1000;
/** Longest range one list/availability request may cover. */
const MAX_RANGE_DAYS = 400;

const eventInclude = {
  job: { select: { id: true, address: true, client_name: true, status: true } },
  assignee: { select: { id: true, name: true } },
  calendar_source: { select: { id: true, name: true } },
} satisfies Prisma.EventInclude;

function parseInstant(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parses ?from=&to= (ISO instants or yyyy-MM-dd) and checks the span. */
function parseRange(req: Request): { from: Date; to: Date } | string {
  const from = parseInstant(req.query.from);
  const to = parseInstant(req.query.to);
  if (!from || !to) return "from and to are required (ISO date-times)";
  if (to <= from) return "to must be after from";
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) return `Range can be at most ${MAX_RANGE_DAYS} days`;
  return { from, to };
}

function trimOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

async function orgTimeZone(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
  return org?.timezone ?? "America/Chicago";
}

// ─── GET /calendar/events?from=&to=&assignee_id= ─────────────────────────────
// Every event overlapping [from, to).

router.get("/events", async (req, res) => {
  try {
    const range = parseRange(req);
    if (typeof range === "string") return res.status(400).json({ message: range });
    const assigneeId = typeof req.query.assignee_id === "string" ? req.query.assignee_id : undefined;

    const events = await prisma.event.findMany({
      where: {
        // Overlaps the range, or is a zero-length event starting inside it.
        OR: [
          { start_at: { lt: range.to }, end_at: { gt: range.from } },
          { start_at: { gte: range.from, lt: range.to } },
        ],
        ...(assigneeId && { assignee_id: assigneeId }),
      },
      orderBy: [{ start_at: "asc" }, { end_at: "asc" }],
      include: eventInclude,
      take: 5000,
    });
    return res.json(events);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET/PUT /calendar/settings ─────────────────────────────────────────────
// The org's time zone: working hours for availability, and the zone for
// floating times in imported calendars.

router.get("/settings", async (req, res) => {
  try {
    return res.json({ timezone: await orgTimeZone(req.user!.org_id) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put("/settings", requireManager, async (req, res) => {
  try {
    const { timezone } = req.body as { timezone?: string };
    if (!isValidTimeZone(timezone)) return res.status(400).json({ message: "timezone must be an IANA time zone like America/Chicago" });
    const org = await prisma.organization.update({
      where: { id: req.user!.org_id },
      data: { timezone },
      select: { timezone: true },
    });
    return res.json(org);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /calendar/people ───────────────────────────────────────────────────
// Active users anyone may assign an event to (the /users list is manager-only).

router.get("/people", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── Event create / update ──────────────────────────────────────────────────

interface EventBody {
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  is_busy?: boolean;
  job_id?: string | null;
  assignee_id?: string | null;
}

/**
 * Validates an event body into Prisma data. `existing` is set on update, so
 * omitted fields keep their stored values. Imported events only accept
 * StageFlow-owned fields (job, assignee, busy); the rest belongs to the
 * external calendar and would be overwritten by the next sync anyway.
 */
async function eventData(
  body: EventBody,
  existing?: { start_at: Date; end_at: Date; source: string }
): Promise<Prisma.EventUncheckedUpdateInput | string> {
  const data: Prisma.EventUncheckedUpdateInput = {};
  const imported = existing && existing.source !== "manual";

  if (!imported) {
    if (body.title !== undefined || !existing) {
      const title = trimOrNull(body.title, 500);
      if (!title) return "title is required";
      data.title = title;
    }
    if (body.description !== undefined) data.description = trimOrNull(body.description, 5000);
    if (body.location !== undefined) data.location = trimOrNull(body.location, 500);
    if (body.all_day !== undefined) data.all_day = Boolean(body.all_day);

    let start = existing?.start_at;
    let end = existing?.end_at;
    if (body.start_at !== undefined) {
      const d = parseInstant(body.start_at);
      if (!d) return "start_at must be an ISO date-time";
      start = d;
      data.start_at = d;
    }
    if (body.end_at !== undefined) {
      const d = parseInstant(body.end_at);
      if (!d) return "end_at must be an ISO date-time";
      end = d;
      data.end_at = d;
    }
    if (!start) return "start_at is required";
    if (!end) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
      data.end_at = end;
    }
    if (end < start) return "end_at must not be before start_at";
  }

  if (body.is_busy !== undefined) data.is_busy = Boolean(body.is_busy);

  if (body.job_id !== undefined) {
    if (body.job_id) {
      const job = await prisma.job.findUnique({ where: { id: body.job_id }, select: { id: true } });
      if (!job) return "job_id does not match a job";
    }
    data.job_id = body.job_id || null;
  }
  if (body.assignee_id !== undefined) {
    if (body.assignee_id) {
      const user = await prisma.user.findUnique({ where: { id: body.assignee_id }, select: { id: true } });
      if (!user) return "assignee_id does not match a user";
    }
    data.assignee_id = body.assignee_id || null;
  }
  return data;
}

/** Managers edit anything; staff edit events they created or are assigned to. */
function canEdit(req: Request, ev: { created_by: string | null; assignee_id: string | null }) {
  const u = req.user!;
  return u.role === "manager" || ev.created_by === u.userId || ev.assignee_id === u.userId;
}

// ─── POST /calendar/events ──────────────────────────────────────────────────

router.post("/events", async (req, res) => {
  try {
    const data = await eventData(req.body as EventBody);
    if (typeof data === "string") return res.status(400).json({ message: data });
    const event = await prisma.event.create({
      data: {
        ...(data as Prisma.EventUncheckedCreateInput),
        org_id: req.user!.org_id,
        source: "manual",
        created_by: req.user!.userId,
      },
      include: eventInclude,
    });
    return res.status(201).json(event);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /calendar/events/:id ───────────────────────────────────────────────

router.get("/events/:id", async (req, res) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.id }, include: eventInclude });
    if (!event) return res.status(404).json({ message: "Event not found" });
    return res.json(event);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── PATCH /calendar/events/:id ─────────────────────────────────────────────

router.patch("/events/:id", async (req, res) => {
  try {
    const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Event not found" });
    if (!canEdit(req, existing)) return res.status(403).json({ message: "You can only edit your own events" });

    const data = await eventData(req.body as EventBody, existing);
    if (typeof data === "string") return res.status(400).json({ message: data });
    const event = await prisma.event.update({ where: { id: existing.id }, data, include: eventInclude });
    return res.json(event);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── DELETE /calendar/events/:id ────────────────────────────────────────────
// Deleting an event that came from a subscription only lasts until the next
// sync re-adds it; remove it in the source calendar instead.

router.delete("/events/:id", async (req, res) => {
  try {
    const existing = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Event not found" });
    if (!canEdit(req, existing)) return res.status(403).json({ message: "You can only delete your own events" });
    await prisma.event.delete({ where: { id: existing.id } });
    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /calendar/availability ─────────────────────────────────────────────
// ?from=&to=&duration_minutes=60&step_minutes=30&day_start=09:00&day_end=17:00
//  &days=1,2,3,4,5&tz=<IANA>&assignee_id=
// Free slots of `duration_minutes` inside working hours. Busy = every event
// marked busy, or with assignee_id: that person's events plus unassigned ones.

function parseClock(v: unknown, fallback: number): number | null {
  if (v === undefined || v === "") return fallback;
  const m = typeof v === "string" ? v.match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) <= 24 && Number(m[2]) < 60 && minutes <= 24 * 60 ? minutes : null;
}

function parseIntParam(v: unknown, fallback: number, min: number, max: number): number | null {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

router.get("/availability", async (req, res) => {
  try {
    const range = parseRange(req);
    if (typeof range === "string") return res.status(400).json({ message: range });

    const duration = parseIntParam(req.query.duration_minutes, 60, 5, 24 * 60);
    const step = parseIntParam(req.query.step_minutes, 30, 5, 24 * 60);
    const dayStart = parseClock(req.query.day_start, 9 * 60);
    const dayEnd = parseClock(req.query.day_end, 17 * 60);
    if (duration === null) return res.status(400).json({ message: "duration_minutes must be 5–1440" });
    if (step === null) return res.status(400).json({ message: "step_minutes must be 5–1440" });
    if (dayStart === null || dayEnd === null || dayEnd <= dayStart) {
      return res.status(400).json({ message: "day_start/day_end must be HH:MM with day_end after day_start" });
    }
    const days =
      typeof req.query.days === "string" && req.query.days.trim()
        ? req.query.days.split(",").map((d) => Number(d.trim()))
        : [1, 2, 3, 4, 5];
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return res.status(400).json({ message: "days must be weekday numbers 0 (Sun) – 6 (Sat)" });
    }
    let timeZone = await orgTimeZone(req.user!.org_id);
    if (req.query.tz !== undefined) {
      if (!isValidTimeZone(req.query.tz)) return res.status(400).json({ message: "tz must be an IANA time zone" });
      timeZone = req.query.tz;
    }
    const assigneeId = typeof req.query.assignee_id === "string" && req.query.assignee_id ? req.query.assignee_id : undefined;

    const busyEvents = await prisma.event.findMany({
      where: {
        is_busy: true,
        start_at: { lt: range.to },
        end_at: { gt: range.from },
        ...(assigneeId && { OR: [{ assignee_id: assigneeId }, { assignee_id: null }] }),
      },
      select: { id: true, title: true, start_at: true, end_at: true },
      orderBy: { start_at: "asc" },
      take: 5000,
    });

    const slots = findFreeSlots(
      busyEvents.map((e) => ({ start: e.start_at, end: e.end_at })),
      {
        from: range.from, to: range.to, timeZone,
        dayStartMinutes: dayStart, dayEndMinutes: dayEnd, workingDays: days,
        durationMinutes: duration, stepMinutes: step,
      }
    );

    return res.json({
      time_zone: timeZone,
      duration_minutes: duration,
      slots,
      busy: busyEvents.map((e) => ({ id: e.id, title: e.title, start: e.start_at, end: e.end_at })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /calendar/import (manager) ────────────────────────────────────────
// Body: raw .ics text (Content-Type: text/calendar). Imports events from 90
// days back to a year ahead; re-importing the same file updates, not duplicates.

router.post(
  "/import",
  requireManager,
  express.text({ type: ["text/calendar", "text/plain", "application/octet-stream"], limit: "5mb" }),
  async (req, res) => {
    try {
      if (typeof req.body !== "string" || !req.body.trim()) {
        return res.status(400).json({ message: "Send the .ics file contents with Content-Type: text/calendar" });
      }
      const events = parseIcs(req.body, {
        ...defaultImportWindow(),
        fallbackTimeZone: await orgTimeZone(req.user!.org_id),
      });
      const result = await upsertImportedEvents(events, { source: "ics_file", userId: req.user!.userId });
      return res.json({ ...result, total: events.length });
    } catch (err) {
      if (err instanceof IcsParseError) return res.status(400).json({ message: err.message });
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

// ─── Calendar subscriptions (manager) ───────────────────────────────────────
// The feed URL is often a secret (Google's "secret address"), so only managers
// see it.

router.get("/sources", requireManager, async (_req, res) => {
  try {
    const sources = await prisma.calendarSource.findMany({ orderBy: { created_at: "asc" } });
    return res.json(sources);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/sources", requireManager, async (req, res) => {
  try {
    const { name, url } = req.body as { name?: string; url?: string };
    if (!url?.trim()) return res.status(400).json({ message: "url is required" });
    let normalized: string;
    try {
      normalized = normalizeFeedUrl(url);
    } catch (err) {
      return res.status(400).json({
        message: err instanceof IcsFetchError ? err.message : "url must be a valid calendar link",
      });
    }
    const dupe = await prisma.calendarSource.findFirst({ where: { url: normalized } });
    if (dupe) return res.status(409).json({ message: `Already subscribed as "${dupe.name}"` });

    const source = await prisma.calendarSource.create({
      data: {
        org_id: req.user!.org_id,
        name: trimOrNull(name, 200) ?? new URL(normalized).hostname,
        url: normalized,
      },
    });
    // Only keep subscriptions that work: a wrong or unreachable link is
    // reported back instead of being saved as a permanently failing source.
    const result = await syncCalendarSource(source);
    if (result.error) {
      await prisma.calendarSource.delete({ where: { id: source.id } });
      return res.status(400).json({ message: result.error });
    }
    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/sources/:id/sync", requireManager, async (req, res) => {
  try {
    const source = await prisma.calendarSource.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ message: "Calendar not found" });
    return res.json(await syncCalendarSource(source));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/sources/:id", requireManager, async (req, res) => {
  try {
    const source = await prisma.calendarSource.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ message: "Calendar not found" });
    const name = trimOrNull((req.body as { name?: string }).name, 200);
    if (!name) return res.status(400).json({ message: "name is required" });
    return res.json(await prisma.calendarSource.update({ where: { id: source.id }, data: { name } }));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Unsubscribing removes the events that came from the feed (FK cascade).
router.delete("/sources/:id", requireManager, async (req, res) => {
  try {
    const source = await prisma.calendarSource.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ message: "Calendar not found" });
    await prisma.calendarSource.delete({ where: { id: source.id } });
    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
