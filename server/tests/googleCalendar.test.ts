import crypto from "crypto";
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { rawPrisma } from "../src/lib/prisma";
import { open, seal } from "../src/lib/secretBox";
import { toParsedEvent } from "../src/lib/googleCalendar";
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

/** A fake Google: token, calendar list, events and revoke endpoints, editable per test. */
function fakeGoogle() {
  const google = {
    calendars: [
      { id: EMAIL, summary: EMAIL, summaryOverride: "My calendar", primary: true },
      { id: "team@group.calendar.google.com", summary: "Team" },
    ],
    events: new Map<string, unknown[]>(),
    refreshTokenValid: true,
    grantedScope:
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly",
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
    const m = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/);
    if (m) {
      const items = google.events.get(decodeURIComponent(m[1]));
      return items ? json(200, { items }) : json(404, { error: { message: "Not Found" } });
    }
    return json(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return google;
}

/** Runs connect + the browser's trip through Google and back; returns the callback response. */
async function connectGoogle(token: string, google: ReturnType<typeof fakeGoogle>) {
  const res = await request(app).post("/api/v1/calendar/google/connect").set(authHeader(token)).send({ return_to: APP_ORIGIN });
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
    vi.stubEnv("GOOGLE_CLIENT_ID", "123456-testclient.apps.googleusercontent.com");
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
    expect(status.body).toEqual({ configured: true, config_error: null, connections: [] });
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
    google.grantedScope =
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly";
    google.events.set(EMAIL, []);
    await connectGoogle(manager.token, google);
    const conn = await rawPrisma.googleConnection.findFirstOrThrow();
    const other = await createOrg();
    const outsider = await registerUser(app, { role: "manager", code: other.invite_code });
    expect((await request(app).get("/api/v1/calendar/google").set(authHeader(outsider.token))).body.connections).toEqual([]);
    expect((await request(app).get(`/api/v1/calendar/google/${conn.id}/calendars`).set(authHeader(outsider.token))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/calendar/google/${conn.id}`).set(authHeader(outsider.token))).status).toBe(404);
  });

  it("turns off with a clear reason when the Google env vars are missing or malformed", async () => {
    const manager = await registerUser(app, { role: "manager" });
    const status = async () => (await request(app).get("/api/v1/calendar/google").set(authHeader(manager.token))).body;

    // Surrounding whitespace (a pasted trailing newline) is fine.
    vi.stubEnv("GOOGLE_CLIENT_ID", " 123456-testclient.apps.googleusercontent.com\n");
    expect(await status()).toMatchObject({ configured: true, config_error: null });

    // Nothing set: off, and not an error.
    for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI", "CALENDAR_TOKEN_KEY"]) {
      vi.stubEnv(name, "");
    }
    expect(await status()).toMatchObject({ configured: false, config_error: null });
    vi.unstubAllEnvs();
    vi.stubEnv("GOOGLE_CLIENT_ID", "123456-testclient.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "GOCSPX-test-secret");
    vi.stubEnv("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:3001/api/v1/calendar/google/callback");
    vi.stubEnv("CALENDAR_TOKEN_KEY", crypto.randomBytes(32).toString("base64"));
    vi.stubEnv("CORS_ORIGIN", APP_ORIGIN);

    const cases: [string, string, RegExp][] = [
      // Two env-file lines pasted into one variable: must never reach Google.
      ["GOOGLE_CLIENT_ID", "123456-testclient.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=GOCSPX-test-secret", /GOOGLE_CLIENT_ID/],
      ["GOOGLE_CLIENT_ID", '"123456-testclient.apps.googleusercontent.com"', /GOOGLE_CLIENT_ID/],
      ["GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET=GOCSPX-test-secret", /GOOGLE_CLIENT_SECRET/],
      ["GOOGLE_OAUTH_REDIRECT_URI", "https://api.example.com/", /GOOGLE_OAUTH_REDIRECT_URI/],
      ["CALENDAR_TOKEN_KEY", "CALENDAR_TOKEN_KEY=" + crypto.randomBytes(32).toString("base64"), /CALENDAR_TOKEN_KEY/],
      ["GOOGLE_CLIENT_SECRET", "", /GOOGLE_CLIENT_SECRET is not set/],
    ];
    for (const [name, value, message] of cases) {
      const good = process.env[name]!;
      vi.stubEnv(name, value);
      const body = await status();
      expect(body.configured).toBe(false);
      expect(body.config_error).toMatch(message);
      expect(body.config_error).not.toContain("GOCSPX");
      const connect = await request(app).post("/api/v1/calendar/google/connect").set(authHeader(manager.token)).send({ return_to: APP_ORIGIN });
      expect(connect.status).toBe(503);
      expect(connect.body.message).toMatch(/misconfigured/);
      vi.stubEnv(name, good);
    }
    expect(await status()).toMatchObject({ configured: true, config_error: null });
  });
});
