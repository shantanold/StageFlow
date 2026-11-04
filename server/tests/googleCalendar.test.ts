import crypto from "crypto";
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { open, seal } from "../src/lib/secretBox";
import { isJobEventUid, jobEventId, toParsedEvent } from "../src/lib/googleCalendar";
import { cleanDb, createOrg, registerUser, authHeader } from "./helpers";

const APP_ORIGIN = "http://localhost:5173";
const EMAIL = "owner@example.com";

function daysFromNow(days: number, hourUtc = 15) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

function timedEvent(id: string, title: string, start: Date, extra: Record<string, unknown> = {}) {
  return {
    id, iCalUID: `${id}@google.com`, status: "confirmed", summary: title,
    start: { dateTime: start.toISOString() },
    end: { dateTime: new Date(start.getTime() + 3600_000).toISOString() },
    ...extra,
  };
}

const READ_SCOPES =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly";
const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

interface WrittenEvent {
  id: string;
  status: string;
  summary: string;
  description: string;
  location: string;
  start: { date: string };
  end: { date: string };
  extendedProperties: { private: Record<string, string> };
}

/** A fake Google: token, calendar list, events (read and write) and revoke endpoints, editable per test. */
function fakeGoogle() {
  const google = {
    calendars: [
      { id: EMAIL, summary: EMAIL, summaryOverride: "My calendar", primary: true, accessRole: "owner" },
      { id: "team@group.calendar.google.com", summary: "Team", accessRole: "reader" },
    ] as Record<string, unknown>[],
    events: new Map<string, unknown[]>(),
    /** Events written through the API, by calendar then id. Deleted ones linger as "cancelled", like Google. */
    written: new Map<string, Map<string, WrittenEvent>>(),
    refreshTokenValid: true,
    grantedScope: READ_SCOPES,
    tokenRequests: [] as URLSearchParams[],
    revoked: [] as string[],
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.href === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init?.body));
      google.tokenRequests.push(body);
      if (body.get("grant_type") === "refresh_token" && !google.refreshTokenValid) {
        return json(400, { error: "invalid_grant" });
      }
      return json(200, {
        access_token: "access-1",
        ...(body.get("grant_type") === "authorization_code" && { refresh_token: "refresh-secret-1" }),
        scope: google.grantedScope,
      });
    }
    if (url.href === "https://oauth2.googleapis.com/revoke") {
      google.revoked.push(new URLSearchParams(String(init?.body)).get("token")!);
      return new Response("", { status: 200 });
    }
    if ((init?.headers as Record<string, string>)?.Authorization !== "Bearer access-1") return json(401, {});
    if (url.pathname === "/calendar/v3/users/me/calendarList") return json(200, { items: google.calendars });
    const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (m) {
      const calId = decodeURIComponent(m[1]);
      const eventId = m[2];
      const method = init?.method ?? "GET";
      const cal = google.calendars.find((c) => c.id === calId);
      const store = google.written.get(calId) ?? new Map<string, WrittenEvent>();
      if (method !== "GET") {
        if (!cal) return json(404, { error: { message: "Not Found" } });
        if (cal.accessRole === "reader") return json(403, { error: { message: "Forbidden" } });
        google.written.set(calId, store);
      }
      const live = [...store.values()].filter((e) => e.status !== "cancelled");
      if (method === "GET" && !eventId) {
        const prop = url.searchParams.get("privateExtendedProperty");
        if (prop) {
          const [k, v] = prop.split("=");
          return json(200, { items: live.filter((e) => e.extendedProperties.private[k] === v) });
        }
        const items = google.events.get(calId);
        if (!items && !live.length) return json(404, { error: { message: "Not Found" } });
        return json(200, { items: [...(items ?? []), ...live.map((e) => ({ ...e, iCalUID: `${e.id}@google.com` }))] });
      }
      const body = init?.body ? (JSON.parse(String(init.body)) as WrittenEvent) : undefined;
      if (method === "PUT") {
        if (!store.has(eventId!)) return json(404, { error: { message: "Not Found" } });
        store.set(eventId!, body!);
        return json(200, body);
      }
      if (method === "POST") {
        if (store.has(body!.id)) return json(409, { error: { message: "The requested identifier already exists." } });
        store.set(body!.id, body!);
        return json(200, body);
      }
      if (method === "DELETE") {
        const ev = store.get(eventId!);
        if (!ev) return json(404, {});
        if (ev.status === "cancelled") return json(410, {});
        ev.status = "cancelled";
        return new Response(null, { status: 204 });
      }
    }
    return json(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return google;
}

/** Runs connect + the browser's trip through Google and back; returns the callback response. */
async function connectGoogle(token: string, google: ReturnType<typeof fakeGoogle>, write = false) {
  const res = await request(app).post("/api/v1/calendar/google/connect").set(authHeader(token))
    .send({ return_to: APP_ORIGIN, ...(write && { write: true }) });
  expect(res.status).toBe(200);
  const consent = new URL(res.body.url);
  expect(consent.origin).toBe("https://accounts.google.com");
  expect(consent.searchParams.get("code_challenge_method")).toBe("S256");
  expect(consent.searchParams.get("access_type")).toBe("offline");
  const state = consent.searchParams.get("state")!;
  const callback = await request(app).get("/api/v1/calendar/google/callback").query({ state, code: "auth-code" });
  // PKCE: the verifier sent to Google hashes to the challenge in the consent URL.
  const exchange = [...google.tokenRequests].reverse().find((r) => r.get("grant_type") === "authorization_code");
  if (exchange) {
    const hashed = crypto.createHash("sha256").update(exchange.get("code_verifier")!).digest("base64url");
    expect(hashed).toBe(consent.searchParams.get("code_challenge"));
  }
  return { callback, state };
}

describe("google calendar", () => {
  beforeEach(async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:3001/api/v1/calendar/google/callback");
    vi.stubEnv("CALENDAR_TOKEN_KEY", crypto.randomBytes(32).toString("base64"));
    vi.stubEnv("CORS_ORIGIN", APP_ORIGIN);
    await cleanDb();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await cleanDb();
    await rawPrisma.$disconnect();
  });

  it("seals secrets and rejects tampered ones", () => {
    const sealed = seal("refresh-secret");
    expect(sealed).not.toContain("refresh-secret");
    expect(open(sealed)).toBe("refresh-secret");
    expect(open(sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA"))).toBeNull();
    expect(open("garbage")).toBeNull();
  });

  it("converts Google events with the same UIDs an ICS feed would give", () => {
    expect(toParsedEvent({ id: "a", status: "cancelled", start: { date: "2026-12-01" } })).toBeNull();
    expect(toParsedEvent({ id: "a", eventType: "workingLocation", start: { date: "2026-12-01" } })).toBeNull();

    const allDay = toParsedEvent({
      id: "h", iCalUID: "h@google.com", summary: "Holiday", transparency: "transparent",
      start: { date: "2026-12-25" }, end: { date: "2026-12-26" },
    })!;
    expect(allDay).toMatchObject({ external_uid: "h@google.com", all_day: true, is_busy: false });
    expect(allDay.start_at.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(allDay.end_at.toISOString()).toBe("2026-12-26T00:00:00.000Z");

    const occurrence = toParsedEvent({
      id: "r_20261202T150000Z", iCalUID: "r@google.com", recurringEventId: "r",
      start: { dateTime: "2026-12-02T09:00:00-06:00" }, end: { dateTime: "2026-12-02T10:00:00-06:00" },
      originalStartTime: { dateTime: "2026-12-02T09:00:00-06:00" },
    })!;
    expect(occurrence.external_uid).toBe("r@google.com#2026-12-02T15:00:00.000Z");
    expect(occurrence).toMatchObject({ title: "(No title)", all_day: false, is_busy: true });

    const allDayOccurrence = toParsedEvent({
      id: "w", iCalUID: "w@google.com", recurringEventId: "w",
      start: { date: "2026-12-07" }, end: { date: "2026-12-07" }, originalStartTime: { date: "2026-12-07" },
    })!;
    expect(allDayOccurrence.external_uid).toBe("w@google.com#2026-12-07");
    expect(allDayOccurrence.end_at.toISOString()).toBe("2026-12-08T00:00:00.000Z");
  });

  it("connects an account, syncs calendars, re-syncs and disconnects", async () => {
    const google = fakeGoogle();
    const manager = await registerUser(app, { role: "manager" });
    const staff = await registerUser(app, { role: "staff" });

    // Status: configured, nothing connected; staff can't use any of it.
    const status = await request(app).get("/api/v1/calendar/google").set(authHeader(manager.token));
    expect(status.body).toEqual({ configured: true, connections: [] });
    expect((await request(app).post("/api/v1/calendar/google/connect").set(authHeader(staff.token)).send({ return_to: APP_ORIGIN })).status).toBe(403);
    expect((await request(app).post("/api/v1/calendar/google/connect").set(authHeader(manager.token)).send({ return_to: "https://evil.example" })).status).toBe(400);

    const consult = daysFromNow(2);
    google.events.set(EMAIL, [
      timedEvent("c1", "Consult", consult),
      timedEvent("c2", "Dinner", daysFromNow(3), { transparency: "transparent" }),
      timedEvent("c3", "Cancelled", daysFromNow(4), { status: "cancelled" }),
    ]);
    google.events.set("team@group.calendar.google.com", [timedEvent("t1", "Team standup", daysFromNow(5))]);

    const { callback, state } = await connectGoogle(manager.token, google);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(`${APP_ORIGIN}/schedule?google=connected`);

    // The refresh token is stored encrypted, never as plain text.
    const conn = await rawPrisma.googleConnection.findFirstOrThrow();
    expect(conn.google_email).toBe(EMAIL);
    expect(conn.refresh_token).not.toContain("refresh-secret-1");
    expect(open(conn.refresh_token)).toBe("refresh-secret-1");

    // The primary calendar is synced right away.
    const events = await rawPrisma.event.findMany({ orderBy: { start_at: "asc" } });
    expect(events.map((e) => [e.title, e.source, e.is_busy])).toEqual([
      ["Consult", "google", true],
      ["Dinner", "google", false],
    ]);
    expect(events[0].start_at.toISOString()).toBe(consult.toISOString());

    // Calendar list marks the synced one; adding the team calendar syncs it too.
    const cals = await request(app).get(`/api/v1/calendar/google/${conn.id}/calendars`).set(authHeader(manager.token));
    expect(cals.status).toBe(200);
    expect(cals.body.map((c: { name: string; source_id: string | null }) => [c.name, !!c.source_id])).toEqual([
      ["My calendar", true],
      ["Team", false],
    ]);
    const added = await request(app).post(`/api/v1/calendar/google/${conn.id}/calendars`).set(authHeader(manager.token))
      .send({ calendar_id: "team@group.calendar.google.com", name: "Team" });
    expect(added.status).toBe(201);
    expect(added.body.created).toBe(1);
    expect((await request(app).post(`/api/v1/calendar/google/${conn.id}/calendars`).set(authHeader(manager.token))
      .send({ calendar_id: "team@group.calendar.google.com" })).status).toBe(409);
    // A calendar Google won't return isn't kept.
    const missing = await request(app).post(`/api/v1/calendar/google/${conn.id}/calendars`).set(authHeader(manager.token))
      .send({ calendar_id: "gone@group.calendar.google.com" });
    expect(missing.status).toBe(400);
    expect(await rawPrisma.calendarSource.count()).toBe(2);

    // Re-sync mirrors Google: changed events update in place, removed ones go.
    google.events.set(EMAIL, [timedEvent("c1", "Consult (moved)", daysFromNow(6))]);
    const primary = await rawPrisma.calendarSource.findFirstOrThrow({ where: { google_calendar_id: EMAIL } });
    const synced = await request(app).post(`/api/v1/calendar/sources/${primary.id}/sync`).set(authHeader(manager.token));
    expect(synced.body).toMatchObject({ created: 0, updated: 1, removed: 1, error: null });
    expect(await rawPrisma.event.count({ where: { source_id: primary.id } })).toBe(1);

    // Revoked access: the sync records a reconnect message on the source and the account.
    google.refreshTokenValid = false;
    const failed = await request(app).post(`/api/v1/calendar/sources/${primary.id}/sync`).set(authHeader(manager.token));
    expect(failed.body.error).toMatch(/Reconnect Google/);
    const broken = await request(app).get("/api/v1/calendar/google").set(authHeader(manager.token));
    expect(broken.body.connections[0].last_error).toMatch(/Reconnect Google/);

    // Reconnecting the same account updates it in place and clears the error.
    google.refreshTokenValid = true;
    const again = await request(app).get("/api/v1/calendar/google/callback").query({ state, code: "auth-code-2" });
    expect(again.headers.location).toBe(`${APP_ORIGIN}/schedule?google=connected`);
    expect(await rawPrisma.googleConnection.count()).toBe(1);
    expect((await rawPrisma.googleConnection.findFirstOrThrow()).last_error).toBeNull();

    // Disconnect revokes the token and removes its calendars and their events.
    const del = await request(app).delete(`/api/v1/calendar/google/${conn.id}`).set(authHeader(manager.token));
    expect(del.status).toBe(204);
    expect(google.revoked).toEqual(["refresh-secret-1"]);
    expect(await rawPrisma.calendarSource.count()).toBe(0);
    expect(await rawPrisma.event.count()).toBe(0);
  });

  it("rejects bad callbacks, denied consent, missing scopes and other orgs", async () => {
    const google = fakeGoogle();
    const manager = await registerUser(app, { role: "manager" });

    // No or tampered state: no redirect at all.
    expect((await request(app).get("/api/v1/calendar/google/callback").query({ code: "x" })).status).toBe(400);
    expect((await request(app).get("/api/v1/calendar/google/callback").query({ code: "x", state: "v1.a.b.c" })).status).toBe(400);
    // Expired state.
    const expired = seal(JSON.stringify({ org: "o", user: "u", verifier: "v", returnTo: APP_ORIGIN, exp: Date.now() - 1 }));
    expect((await request(app).get("/api/v1/calendar/google/callback").query({ code: "x", state: expired })).status).toBe(400);

    const res = await request(app).post("/api/v1/calendar/google/connect").set(authHeader(manager.token)).send({ return_to: APP_ORIGIN });
    const state = new URL(res.body.url).searchParams.get("state")!;

    const denied = await request(app).get("/api/v1/calendar/google/callback").query({ state, error: "access_denied" });
    expect(denied.status).toBe(302);
    expect(new URL(denied.headers.location).searchParams.get("google_error")).toMatch(/wasn't granted/);

    // The person unchecked a calendar box on Google's consent screen.
    google.grantedScope = "https://www.googleapis.com/auth/calendar.events.readonly";
    const partial = await request(app).get("/api/v1/calendar/google/callback").query({ state, code: "c" });
    expect(new URL(partial.headers.location).searchParams.get("google_error")).toMatch(/calendar boxes/);
    expect(await rawPrisma.googleConnection.count()).toBe(0);

    // Connected in this org: invisible to another org's manager.
    google.grantedScope = READ_SCOPES;
    google.events.set(EMAIL, []);
    await connectGoogle(manager.token, google);
    const conn = await rawPrisma.googleConnection.findFirstOrThrow();
    const other = await createOrg();
    const outsider = await registerUser(app, { role: "manager", code: other.invite_code });
    expect((await request(app).get("/api/v1/calendar/google").set(authHeader(outsider.token))).body.connections).toEqual([]);
    expect((await request(app).get(`/api/v1/calendar/google/${conn.id}/calendars`).set(authHeader(outsider.token))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/calendar/google/${conn.id}`).set(authHeader(outsider.token))).status).toBe(404);
  });

  it("recognizes the job events it writes, so imports skip them", () => {
    const id = jobEventId("0f8fad5b-d9cb-469f-a165-70867728950e", "destage");
    expect(id).toBe("sf0f8fad5bd9cb469fa16570867728950e1");
    // Google event ids are base32hex: 0-9 and a-v only.
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(isJobEventUid(id)).toBe(true);
    expect(isJobEventUid(`${id}@google.com`)).toBe(true);
    expect(isJobEventUid("c1@google.com")).toBe(false);
    expect(toParsedEvent({
      id, start: { date: "2026-12-01" }, extendedProperties: { private: { stageflowJob: "x" } },
    })).toBeNull();
  });

  it("adds jobs to a picked Google calendar and keeps them in line with the job", async () => {
    const google = fakeGoogle();
    google.calendars.push({ id: "jobs@group.calendar.google.com", summary: "Jobs", accessRole: "writer" });
    google.events.set(EMAIL, []);
    const manager = await registerUser(app, { role: "manager" });
    const staff = await registerUser(app, { role: "staff" });
    const jobsUrl = "/api/v1/jobs";
    const newJob = (address: string, extra: Record<string, unknown> = {}) =>
      request(app).post(jobsUrl).set(authHeader(manager.token)).send({
        address, client_name: "Acme Realty", client_contact: "555-0100", city: "Houston", state: "TX", zip: "77002",
        start_date: "2026-12-01", expected_end_date: "2027-03-01", ...extra,
      });
    const written = (cal: string) =>
      [...(google.written.get(cal)?.values() ?? [])].filter((e) => e.status !== "cancelled");

    // Read-only connection: can't pick a calendar for jobs yet.
    await connectGoogle(manager.token, google);
    let conn = await rawPrisma.googleConnection.findFirstOrThrow();
    expect(conn.can_write).toBe(false);
    const jobCal = `/api/v1/calendar/google/${conn.id}/job-calendar`;
    expect((await request(app).put(jobCal).set(authHeader(manager.token)).send({ calendar_id: EMAIL })).status).toBe(409);

    // Asking for write access but unchecking it on Google's screen fails clearly.
    const { callback: denied } = await connectGoogle(manager.token, google, true);
    expect(new URL(denied.headers.location).searchParams.get("google_error")).toMatch(/add events/);

    // Granting it: the consent URL asks for event write access, and the account can now write.
    google.grantedScope = `${READ_SCOPES} ${WRITE_SCOPE}`;
    const writeConnect = await request(app).post("/api/v1/calendar/google/connect").set(authHeader(manager.token))
      .send({ return_to: APP_ORIGIN, write: true });
    expect(new URL(writeConnect.body.url).searchParams.get("scope")).toContain(WRITE_SCOPE);
    await connectGoogle(manager.token, google, true);
    conn = await rawPrisma.googleConnection.findFirstOrThrow();
    expect(conn.can_write).toBe(true);

    // Jobs that exist before a calendar is picked: only upcoming ones get copied over.
    const planned = (await newJob("1 Early St")).body;
    const done = (await newJob("2 Done Ave")).body;
    await request(app).put(`${jobsUrl}/${done.id}`).set(authHeader(manager.token)).send({ status: "completed" });
    expect(written(EMAIL)).toHaveLength(0);

    // Only managers, only calendars this account can add to.
    expect((await request(app).put(jobCal).set(authHeader(staff.token)).send({ calendar_id: EMAIL })).status).toBe(403);
    expect((await request(app).put(jobCal).set(authHeader(manager.token)).send({ calendar_id: "team@group.calendar.google.com" })).status).toBe(400);
    expect((await request(app).put(jobCal).set(authHeader(manager.token)).send({ calendar_id: "nope@example.com" })).status).toBe(400);

    const picked = await request(app).put(jobCal).set(authHeader(manager.token)).send({ calendar_id: EMAIL });
    expect(picked.status).toBe(200);
    expect(picked.body).toMatchObject({ job_calendar_id: EMAIL, pushed: 1, error: null });
    expect(written(EMAIL).map((e) => [e.id, e.summary, e.start.date, e.end.date])).toEqual([
      [jobEventId(planned.id, "stage"), "Staging: 1 Early St", "2026-12-01", "2026-12-02"],
      [jobEventId(planned.id, "destage"), "Destage: 1 Early St", "2027-03-01", "2027-03-02"],
    ]);
    const stageEv = written(EMAIL)[0];
    expect(stageEv.location).toBe("1 Early St, Houston, TX 77002");
    expect(stageEv.description).toContain("Client: Acme Realty");
    expect(stageEv.extendedProperties.private).toMatchObject({ stageflowJob: planned.id, stageflowOrg: conn.org_id });

    // New and edited jobs follow along.
    const job = (await newJob("3 New Rd")).body;
    expect(written(EMAIL)).toHaveLength(4);
    await request(app).put(`${jobsUrl}/${job.id}`).set(authHeader(manager.token)).send({ expected_end_date: "2027-04-15" });
    expect(google.written.get(EMAIL)!.get(jobEventId(job.id, "destage"))!.start.date).toBe("2027-04-15");

    // Syncing the same calendar in doesn't bring the job days back as duplicate events.
    const primary = await rawPrisma.calendarSource.findFirstOrThrow({ where: { google_calendar_id: EMAIL } });
    const synced = await request(app).post(`/api/v1/calendar/sources/${primary.id}/sync`).set(authHeader(manager.token));
    expect(synced.body).toMatchObject({ created: 0, error: null });
    expect(await rawPrisma.event.count()).toBe(0);

    // Cancelling removes its events; un-cancelling brings them back (Google keeps the deleted ids).
    await request(app).put(`${jobsUrl}/${job.id}`).set(authHeader(manager.token)).send({ status: "cancelled" });
    expect(written(EMAIL)).toHaveLength(2);
    await request(app).put(`${jobsUrl}/${job.id}`).set(authHeader(manager.token)).send({ status: "planning" });
    expect(written(EMAIL)).toHaveLength(4);
    // Deleting the job removes them too.
    expect((await request(app).delete(`${jobsUrl}/${job.id}`).set(authHeader(manager.token))).status).toBe(200);
    expect(written(EMAIL).map((e) => e.summary)).toEqual(["Staging: 1 Early St", "Destage: 1 Early St"]);

    // Google failing never blocks saving a job; the error shows on the account instead.
    google.refreshTokenValid = false;
    const offline = await newJob("4 Offline Ln");
    expect(offline.status).toBe(201);
    const status = await request(app).get("/api/v1/calendar/google").set(authHeader(manager.token));
    expect(status.body.connections[0]).toMatchObject({ can_write: true, job_calendar_id: EMAIL });
    expect(status.body.connections[0].push_error).toMatch(/Reconnect Google/);
    google.refreshTokenValid = true;
    await request(app).put(`${jobsUrl}/${offline.body.id}`).set(authHeader(manager.token)).send({ notes: "gate code 1234" });
    expect((await rawPrisma.googleConnection.findFirstOrThrow()).push_error).toBeNull();
    expect(google.written.get(EMAIL)!.get(jobEventId(offline.body.id, "stage"))!.description).toContain("gate code 1234");

    // Switching calendars moves the events; turning it off removes them.
    const moved = await request(app).put(jobCal).set(authHeader(manager.token)).send({ calendar_id: "jobs@group.calendar.google.com" });
    expect(moved.body).toMatchObject({ pushed: 2, error: null });
    expect(written(EMAIL)).toHaveLength(0);
    expect(written("jobs@group.calendar.google.com")).toHaveLength(4);
    const off = await request(app).put(jobCal).set(authHeader(manager.token)).send({ calendar_id: null });
    expect(off.body).toMatchObject({ job_calendar_id: null });
    expect(written("jobs@group.calendar.google.com")).toHaveLength(0);
    await newJob("5 Quiet Ct");
    expect(written("jobs@group.calendar.google.com")).toHaveLength(0);

    // Disconnecting cleans up the calendar it was adding jobs to.
    await request(app).put(jobCal).set(authHeader(manager.token)).send({ calendar_id: EMAIL });
    expect(written(EMAIL)).toHaveLength(6);
    expect((await request(app).delete(`/api/v1/calendar/google/${conn.id}`).set(authHeader(manager.token))).status).toBe(204);
    expect(written(EMAIL)).toHaveLength(0);
  });

  it("reports not configured without the Google env vars", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const manager = await registerUser(app, { role: "manager" });
    const status = await request(app).get("/api/v1/calendar/google").set(authHeader(manager.token));
    expect(status.body.configured).toBe(false);
    expect((await request(app).post("/api/v1/calendar/google/connect").set(authHeader(manager.token)).send({ return_to: APP_ORIGIN })).status).toBe(503);
  });
});
