import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { cleanDb, createOrg, registerUser, authHeader } from "./helpers";

// Subscriptions download a URL; serve canned feeds instead of touching the network.
const feeds = vi.hoisted(() => new Map<string, string>());
vi.mock("../src/lib/icsFetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/icsFetch")>();
  return {
    ...actual,
    fetchIcs: vi.fn(async (url: string) => {
      const body = feeds.get(actual.normalizeFeedUrl(url));
      if (body === undefined) throw new actual.IcsFetchError("The calendar server answered 404");
      return body;
    }),
  };
});

function isoDaysFromNow(days: number, hourUtc = 15) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

function icsStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function vevent(uid: string, title: string, start: Date, minutes = 60) {
  return [
    "BEGIN:VEVENT", `UID:${uid}`, `SUMMARY:${title}`,
    `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(new Date(start.getTime() + minutes * 60_000))}`,
    "END:VEVENT",
  ];
}

function cal(...events: string[][]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...events.flat(), "END:VCALENDAR"].join("\r\n");
}

const range = (from: Date, to: Date) => `from=${from.toISOString()}&to=${to.toISOString()}`;

describe("calendar", () => {
  beforeEach(async () => {
    feeds.clear();
    await cleanDb();
  });
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("creates, lists by range, updates and deletes events; links jobs and assignees", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const job = await request(app).post("/api/v1/jobs").set(authHeader(manager.token)).send({
      address: "12 Oak St", client_name: "Realtor", start_date: "2026-11-02", expected_end_date: "2026-12-02",
    });

    const start = isoDaysFromNow(3);
    const created = await request(app).post("/api/v1/calendar/events").set(authHeader(manager.token)).send({
      title: "  Install  ", start_at: start.toISOString(), end_at: new Date(start.getTime() + 2 * 3600_000).toISOString(),
      job_id: job.body.id, assignee_id: manager.userId, location: "12 Oak St",
    });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe("Install");
    expect(created.body.source).toBe("manual");
    expect(created.body.job.address).toBe("12 Oak St");
    expect(created.body.assignee.id).toBe(manager.userId);

    const inRange = await request(app).get(`/api/v1/calendar/events?${range(isoDaysFromNow(2), isoDaysFromNow(4))}`)
      .set(authHeader(manager.token));
    expect(inRange.status).toBe(200);
    expect(inRange.body.map((e: { id: string }) => e.id)).toEqual([created.body.id]);

    const outOfRange = await request(app).get(`/api/v1/calendar/events?${range(isoDaysFromNow(5), isoDaysFromNow(6))}`)
      .set(authHeader(manager.token));
    expect(outOfRange.body).toEqual([]);

    const patched = await request(app).patch(`/api/v1/calendar/events/${created.body.id}`).set(authHeader(manager.token))
      .send({ title: "Install + stage", job_id: null });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Install + stage");
    expect(patched.body.job).toBeNull();

    const badEnd = await request(app).patch(`/api/v1/calendar/events/${created.body.id}`).set(authHeader(manager.token))
      .send({ end_at: new Date(start.getTime() - 1000).toISOString() });
    expect(badEnd.status).toBe(400);

    const del = await request(app).delete(`/api/v1/calendar/events/${created.body.id}`).set(authHeader(manager.token));
    expect(del.status).toBe(204);
    expect(await rawPrisma.event.count()).toBe(0);
  });

  it("validates input", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const noTitle = await request(app).post("/api/v1/calendar/events").set(authHeader(manager.token))
      .send({ title: " ", start_at: new Date().toISOString() });
    expect(noTitle.status).toBe(400);
    const noStart = await request(app).post("/api/v1/calendar/events").set(authHeader(manager.token)).send({ title: "x" });
    expect(noStart.status).toBe(400);
    const noRange = await request(app).get("/api/v1/calendar/events").set(authHeader(manager.token));
    expect(noRange.status).toBe(400);
  });

  it("staff can manage their own events but not other people's, and can't import", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const staff = await registerUser(app, { role: "staff" });
    const start = isoDaysFromNow(1).toISOString();

    const mgrEvent = await request(app).post("/api/v1/calendar/events").set(authHeader(manager.token))
      .send({ title: "Manager's", start_at: start });
    const staffEvent = await request(app).post("/api/v1/calendar/events").set(authHeader(staff.token))
      .send({ title: "Staff's", start_at: start });
    expect(staffEvent.status).toBe(201);

    expect((await request(app).patch(`/api/v1/calendar/events/${mgrEvent.body.id}`).set(authHeader(staff.token))
      .send({ title: "nope" })).status).toBe(403);
    expect((await request(app).delete(`/api/v1/calendar/events/${mgrEvent.body.id}`).set(authHeader(staff.token)))
      .status).toBe(403);
    expect((await request(app).patch(`/api/v1/calendar/events/${staffEvent.body.id}`).set(authHeader(staff.token))
      .send({ title: "Mine" })).status).toBe(200);
    // Managers can edit anyone's.
    expect((await request(app).patch(`/api/v1/calendar/events/${staffEvent.body.id}`).set(authHeader(manager.token))
      .send({ title: "Edited" })).status).toBe(200);

    const imp = await request(app).post("/api/v1/calendar/import").set(authHeader(staff.token))
      .set("Content-Type", "text/calendar").send(cal(vevent("x@test", "X", isoDaysFromNow(1))));
    expect(imp.status).toBe(403);
    expect((await request(app).get("/api/v1/calendar/sources").set(authHeader(staff.token))).status).toBe(403);

    const people = await request(app).get("/api/v1/calendar/people").set(authHeader(staff.token));
    expect(people.status).toBe(200);
    expect(people.body).toHaveLength(2);
  });

  it("imports an .ics file and de-duplicates re-imports by UID, keeping local links", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const start = isoDaysFromNow(5);
    const file = cal(vevent("one@test", "Consult", start), vevent("two@test", "Pickup", isoDaysFromNow(6)));

    const first = await request(app).post("/api/v1/calendar/import").set(authHeader(manager.token))
      .set("Content-Type", "text/calendar").send(file);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ created: 2, updated: 0, total: 2 });

    const consult = await rawPrisma.event.findFirstOrThrow({ where: { external_uid: "one@test" } });
    expect(consult.source).toBe("ics_file");
    expect(consult.start_at.toISOString()).toBe(start.toISOString());

    // Assign it locally, then re-import a changed title.
    await request(app).patch(`/api/v1/calendar/events/${consult.id}`).set(authHeader(manager.token))
      .send({ assignee_id: manager.userId, title: "ignored for imported events" });
    const again = await request(app).post("/api/v1/calendar/import").set(authHeader(manager.token))
      .set("Content-Type", "text/calendar")
      .send(cal(vevent("one@test", "Consult (renamed)", start), vevent("two@test", "Pickup", isoDaysFromNow(6))));
    expect(again.body).toMatchObject({ created: 0, updated: 2 });

    expect(await rawPrisma.event.count()).toBe(2);
    const after = await rawPrisma.event.findUniqueOrThrow({ where: { id: consult.id } });
    expect(after.title).toBe("Consult (renamed)");
    expect(after.assignee_id).toBe(manager.userId);

    const bad = await request(app).post("/api/v1/calendar/import").set(authHeader(manager.token))
      .set("Content-Type", "text/calendar").send("not a calendar");
    expect(bad.status).toBe(400);
  });

  it("subscribes to an ICS/webcal URL and mirrors changes on sync", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const url = "https://calendar.example.com/feed.ics";
    feeds.set(url, cal(vevent("a@feed", "A", isoDaysFromNow(2)), vevent("b@feed", "B", isoDaysFromNow(3))));

    const sub = await request(app).post("/api/v1/calendar/sources").set(authHeader(manager.token))
      .send({ name: "Office iCloud", url: "webcal://calendar.example.com/feed.ics" });
    expect(sub.status).toBe(201);
    expect(sub.body.error).toBeNull();
    expect(sub.body.created).toBe(2);
    expect(sub.body.source.url).toBe(url);
    expect(sub.body.source.event_count).toBe(2);
    const sourceId = sub.body.source.id as string;

    const dupe = await request(app).post("/api/v1/calendar/sources").set(authHeader(manager.token)).send({ url });
    expect(dupe.status).toBe(409);

    // B removed upstream, C added, A moved.
    const movedA = isoDaysFromNow(4);
    feeds.set(url, cal(vevent("a@feed", "A", movedA), vevent("c@feed", "C", isoDaysFromNow(5))));
    const sync = await request(app).post(`/api/v1/calendar/sources/${sourceId}/sync`).set(authHeader(manager.token));
    expect(sync.body).toMatchObject({ created: 1, updated: 1, removed: 1, error: null });
    const titles = (await rawPrisma.event.findMany({ orderBy: { title: "asc" } })).map((e) => e.title);
    expect(titles).toEqual(["A", "C"]);
    expect((await rawPrisma.event.findFirstOrThrow({ where: { external_uid: "a@feed" } })).start_at.toISOString())
      .toBe(movedA.toISOString());

    // A broken feed records the error and keeps existing events.
    feeds.delete(url);
    const failed = await request(app).post(`/api/v1/calendar/sources/${sourceId}/sync`).set(authHeader(manager.token));
    expect(failed.status).toBe(200);
    expect(failed.body.error).toMatch(/404/);
    expect(failed.body.source.last_error).toMatch(/404/);
    expect(await rawPrisma.event.count()).toBe(2);

    // Unsubscribing removes the feed's events.
    expect((await request(app).delete(`/api/v1/calendar/sources/${sourceId}`).set(authHeader(manager.token))).status)
      .toBe(204);
    expect(await rawPrisma.event.count()).toBe(0);

    const badUrl = await request(app).post("/api/v1/calendar/sources").set(authHeader(manager.token))
      .send({ url: "ftp://example.com/x.ics" });
    expect(badUrl.status).toBe(400);

    // A link whose first download fails is rejected, not saved.
    const unreachable = await request(app).post("/api/v1/calendar/sources").set(authHeader(manager.token))
      .send({ url: "https://calendar.example.com/missing.ics" });
    expect(unreachable.status).toBe(400);
    expect(unreachable.body.message).toMatch(/404/);
    expect(await rawPrisma.calendarSource.count()).toBe(0);
  });

  it("reports availability in the org's time zone, ignoring free and other people's events", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const staff = await registerUser(app, { role: "staff" });
    expect((await request(app).put("/api/v1/calendar/settings").set(authHeader(manager.token))
      .send({ timezone: "America/New_York" })).body.timezone).toBe("America/New_York");

    // Monday 2026-11-02 (EST, UTC-5): working 9–12 → 14:00–17:00Z.
    const post = (body: object) =>
      request(app).post("/api/v1/calendar/events").set(authHeader(manager.token)).send(body);
    await post({ title: "Busy 10–11", start_at: "2026-11-02T15:00:00Z", end_at: "2026-11-02T16:00:00Z" });
    await post({ title: "Free", start_at: "2026-11-02T14:00:00Z", end_at: "2026-11-02T15:00:00Z", is_busy: false });
    await post({ title: "Staff only", start_at: "2026-11-02T16:00:00Z", end_at: "2026-11-02T17:00:00Z", assignee_id: staff.userId });

    const q = "from=2026-11-02T05:00:00Z&to=2026-11-03T05:00:00Z&day_start=09:00&day_end=12:00&duration_minutes=60&step_minutes=60";
    const all = await request(app).get(`/api/v1/calendar/availability?${q}`).set(authHeader(staff.token));
    expect(all.status).toBe(200);
    expect(all.body.time_zone).toBe("America/New_York");
    expect(all.body.slots.map((s: { start: string }) => s.start)).toEqual(["2026-11-02T14:00:00.000Z"]);

    // For the manager, the staff member's event doesn't count.
    const mine = await request(app).get(`/api/v1/calendar/availability?${q}&assignee_id=${manager.userId}`)
      .set(authHeader(staff.token));
    expect(mine.body.slots.map((s: { start: string }) => s.start))
      .toEqual(["2026-11-02T14:00:00.000Z", "2026-11-02T16:00:00.000Z"]);

    expect((await request(app).get(`/api/v1/calendar/availability?${q}&tz=Mars/Base`).set(authHeader(staff.token))).status)
      .toBe(400);
    expect((await request(app).put("/api/v1/calendar/settings").set(authHeader(staff.token))
      .send({ timezone: "America/Chicago" })).status).toBe(403);
  });

  it("keeps each org's events, imports and subscriptions separate", async () => {
    const orgA = await registerUser(app, { role: "manager" });
    const other = await createOrg("Org B");
    const orgB = await registerUser(app, { role: "manager", code: other.invite_code });
    const start = isoDaysFromNow(2);

    const aEvent = await request(app).post("/api/v1/calendar/events").set(authHeader(orgA.token))
      .send({ title: "A's", start_at: start.toISOString() });
    // Same UID imported in both orgs must not collide.
    const file = cal(vevent("shared@test", "Shared", start));
    for (const t of [orgA.token, orgB.token]) {
      const r = await request(app).post("/api/v1/calendar/import").set(authHeader(t)).set("Content-Type", "text/calendar").send(file);
      expect(r.body.created).toBe(1);
    }

    const bList = await request(app).get(`/api/v1/calendar/events?${range(isoDaysFromNow(1), isoDaysFromNow(3))}`)
      .set(authHeader(orgB.token));
    expect(bList.body.map((e: { title: string }) => e.title)).toEqual(["Shared"]);
    expect((await request(app).get(`/api/v1/calendar/events/${aEvent.body.id}`).set(authHeader(orgB.token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/calendar/events/${aEvent.body.id}`).set(authHeader(orgB.token))
      .send({ title: "x" })).status).toBe(404);
    expect((await request(app).delete(`/api/v1/calendar/events/${aEvent.body.id}`).set(authHeader(orgB.token))).status).toBe(404);

    // Can't link another org's job or user.
    const aJob = await request(app).post("/api/v1/jobs").set(authHeader(orgA.token)).send({
      address: "1 A St", client_name: "A", start_date: "2026-11-02", expected_end_date: "2026-12-02",
    });
    expect((await request(app).post("/api/v1/calendar/events").set(authHeader(orgB.token))
      .send({ title: "x", start_at: start.toISOString(), job_id: aJob.body.id })).status).toBe(400);
    expect((await request(app).post("/api/v1/calendar/events").set(authHeader(orgB.token))
      .send({ title: "x", start_at: start.toISOString(), assignee_id: orgA.userId })).status).toBe(400);

    feeds.set("https://a.example.com/cal.ics", cal());
    const aSource = await request(app).post("/api/v1/calendar/sources").set(authHeader(orgA.token))
      .send({ url: "https://a.example.com/cal.ics" });
    expect((await request(app).get("/api/v1/calendar/sources").set(authHeader(orgB.token))).body).toEqual([]);
    expect((await request(app).post(`/api/v1/calendar/sources/${aSource.body.source.id}/sync`).set(authHeader(orgB.token)))
      .status).toBe(404);
    expect((await request(app).delete(`/api/v1/calendar/sources/${aSource.body.source.id}`).set(authHeader(orgB.token)))
      .status).toBe(404);
  });
});
