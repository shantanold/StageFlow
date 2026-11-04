import { Router, type Request, type Response } from "express";
import { prisma, rawPrisma } from "../lib/prisma";
import { runWithOrg } from "../lib/tenantContext";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";
import { open, seal } from "../lib/secretBox";
import { allowedOrigins } from "../lib/origins";
import { syncCalendarSource } from "../lib/calendarSync";
import { backfillJobs, removeJobEvents } from "../lib/jobCalendarPush";
import {
  authorizationUrl, exchangeCode, GoogleApiError, GoogleAuthError, googleConfigured,
  listCalendars, pkcePair, refreshAccessToken, revokeToken,
} from "../lib/googleCalendar";

/**
 * Google Calendar (mounted at /api/v1/calendar/google).
 * A manager connects a Google account with OAuth; each of its calendars they
 * pick becomes a CalendarSource that syncs like an ICS subscription. A
 * manager can also grant write access and pick one calendar that StageFlow
 * adds every job's staging and destage days to (see lib/jobCalendarPush.ts).
 */
const router = Router();

/** How long the user has to finish Google's consent screen. */
const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthState {
  org: string;
  user: string;
  verifier: string;
  returnTo: string;
  exp: number;
  /** Asked Google for event write access too. */
  write?: boolean;
}

function errorMessage(err: unknown) {
  return err instanceof GoogleApiError || err instanceof GoogleAuthError ? err.message : "Couldn't connect Google Calendar";
}

/** Back to the Schedule page of the frontend that started the flow. */
function redirectBack(res: Response, returnTo: string, result: { ok: true } | { error: string }) {
  const params = new URLSearchParams("ok" in result ? { google: "connected" } : { google_error: result.error });
  return res.redirect(302, `${returnTo}/schedule?${params}`);
}

// ─── GET /calendar/google/callback (public: Google redirects the browser here) ─

router.get("/callback", async (req: Request, res: Response) => {
  const raw = typeof req.query.state === "string" ? open(req.query.state) : null;
  let state: OAuthState | null = null;
  try {
    state = raw ? (JSON.parse(raw) as OAuthState) : null;
  } catch {
    state = null;
  }
  // Without a valid state there's no trusted place to send the browser back to.
  if (!state || state.exp < Date.now() || !allowedOrigins().includes(state.returnTo)) {
    return res.status(400).type("text/plain").send("This Google sign-in link has expired. Go back to StageFlow and try connecting again.");
  }
  const { org, user, verifier, returnTo, write = false } = state;

  if (typeof req.query.error === "string") {
    return redirectBack(res, returnTo, {
      error: req.query.error === "access_denied" ? "Google Calendar access wasn't granted" : `Google sign-in failed (${req.query.error})`,
    });
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) return redirectBack(res, returnTo, { error: "Google didn't send a sign-in code" });

  try {
    // The person who started the flow must still be an active manager of an active org.
    const manager = await rawPrisma.user.findFirst({
      where: { id: user, org_id: org, role: "manager", is_active: true, org: { is_active: true } },
      select: { id: true },
    });
    if (!manager) return redirectBack(res, returnTo, { error: "Only managers can connect Google Calendar" });

    const tokens = await exchangeCode(code, verifier, write);
    const calendars = await listCalendars(tokens.accessToken);
    const primary = calendars.find((c) => c.primary);
    if (!primary) return redirectBack(res, returnTo, { error: "That Google account has no calendar" });

    await runWithOrg(org, async () => {
      const existing = await prisma.googleConnection.findUnique({
        where: { org_id_google_email: { org_id: org, google_email: primary.id } },
      });
      if (existing) {
        await prisma.googleConnection.update({
          where: { id: existing.id },
          data: {
            refresh_token: seal(tokens.refreshToken), connected_by: user, last_error: null, push_error: null,
            can_write: tokens.canWrite,
          },
        });
        // Reconnecting fixes the calendars that failed while access was broken.
        const sources = await prisma.calendarSource.findMany({ where: { google_connection_id: existing.id } });
        for (const s of sources) await syncCalendarSource(s);
        return;
      }
      const conn = await prisma.googleConnection.create({
        data: {
          org_id: org, google_email: primary.id, refresh_token: seal(tokens.refreshToken), connected_by: user,
          can_write: tokens.canWrite,
        },
      });
      // Start with the main calendar; others can be added from the list.
      const source = await prisma.calendarSource.create({
        data: { org_id: org, name: primary.name, google_connection_id: conn.id, google_calendar_id: primary.id },
      });
      await syncCalendarSource(source);
    });
    return redirectBack(res, returnTo, { ok: true });
  } catch (err) {
    if (!(err instanceof GoogleApiError || err instanceof GoogleAuthError)) console.error("google callback", err);
    return redirectBack(res, returnTo, { error: errorMessage(err) });
  }
});

// ─── Everything else: signed-in managers ────────────────────────────────────

router.use(authenticate, requireManager);

// GET /calendar/google: whether the server is set up, and the connected accounts.
router.get("/", async (_req, res) => {
  try {
    const connections = await prisma.googleConnection.findMany({
      orderBy: { created_at: "asc" },
      select: {
        id: true, google_email: true, last_error: true, created_at: true,
        can_write: true, job_calendar_id: true, push_error: true,
        connector: { select: { name: true } },
      },
    });
    return res.json({ configured: googleConfigured(), connections });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /calendar/google/connect { return_to, write? }: the Google consent URL to send the browser to.
// write: also ask for permission to add events (for adding jobs to Google).
router.post("/connect", async (req, res) => {
  if (!googleConfigured()) return res.status(503).json({ message: "Google Calendar isn't set up on this server" });
  // A platform admin acting in a customer org must not attach their own Google account to it.
  if (req.user!.acting) return res.status(403).json({ message: "Connect Google Calendar from your own account, not while acting as an admin" });

  const returnTo = String((req.body as { return_to?: string })?.return_to ?? "").replace(/\/+$/, "");
  if (!allowedOrigins().includes(returnTo)) return res.status(400).json({ message: "return_to must be an allowed app origin" });

  const write = (req.body as { write?: unknown })?.write === true;
  const { verifier, challenge } = pkcePair();
  const state: OAuthState = {
    org: req.user!.org_id, user: req.user!.userId, verifier, returnTo, exp: Date.now() + STATE_TTL_MS, write,
  };
  return res.json({ url: authorizationUrl(seal(JSON.stringify(state)), challenge, write) });
});

async function findConnection(id: string) {
  return prisma.googleConnection.findUnique({ where: { id } });
}

// GET /calendar/google/:id/calendars: the account's calendars, marked with the ones being synced.
router.get("/:id/calendars", async (req, res) => {
  try {
    const conn = await findConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Google account not found" });
    const refreshToken = open(conn.refresh_token);
    if (!refreshToken) throw new GoogleAuthError("Reconnect Google to list its calendars.");
    const calendars = await listCalendars(await refreshAccessToken(refreshToken));
    const synced = await prisma.calendarSource.findMany({
      where: { google_connection_id: conn.id },
      select: { id: true, google_calendar_id: true },
    });
    const sourceFor = new Map(synced.map((s) => [s.google_calendar_id, s.id]));
    return res.json(calendars.map((c) => ({ ...c, source_id: sourceFor.get(c.id) ?? null })));
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      await prisma.googleConnection.update({ where: { id: req.params.id }, data: { last_error: err.message } }).catch(() => {});
      return res.status(409).json({ message: err.message });
    }
    if (err instanceof GoogleApiError) return res.status(502).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /calendar/google/:id/calendars { calendar_id, name? }: start syncing one calendar.
router.post("/:id/calendars", async (req, res) => {
  try {
    const conn = await findConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Google account not found" });
    const { calendar_id, name } = req.body as { calendar_id?: string; name?: string };
    if (typeof calendar_id !== "string" || !calendar_id.trim()) {
      return res.status(400).json({ message: "calendar_id is required" });
    }
    const dupe = await prisma.calendarSource.findFirst({
      where: { google_connection_id: conn.id, google_calendar_id: calendar_id },
    });
    if (dupe) return res.status(409).json({ message: `Already syncing "${dupe.name}"` });

    const source = await prisma.calendarSource.create({
      data: {
        org_id: req.user!.org_id,
        name: (typeof name === "string" && name.trim().slice(0, 200)) || calendar_id.slice(0, 200),
        google_connection_id: conn.id,
        google_calendar_id: calendar_id,
      },
    });
    // Same as ICS subscriptions: only keep calendars whose first sync works.
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

// PUT /calendar/google/:id/job-calendar { calendar_id | null }: pick the calendar every
// job's staging and destage days are added to, or turn that off. One per org: picking
// a calendar here turns it off everywhere else. Events in a calendar that stops being
// kept up to date are removed from it, since they would go stale.
router.put("/:id/job-calendar", async (req, res) => {
  try {
    const conn = await findConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Google account not found" });
    const raw = (req.body as { calendar_id?: unknown })?.calendar_id;
    if (raw !== null && (typeof raw !== "string" || !raw.trim())) {
      return res.status(400).json({ message: "calendar_id must be a calendar id or null" });
    }
    const calendarId = raw as string | null;

    if (calendarId) {
      if (!conn.can_write) {
        return res.status(409).json({ message: "Allow StageFlow to add events to this Google account first" });
      }
      const refreshToken = open(conn.refresh_token);
      if (!refreshToken) throw new GoogleAuthError("Reconnect Google to pick a calendar.");
      const calendars = await listCalendars(await refreshAccessToken(refreshToken));
      const cal = calendars.find((c) => c.id === calendarId);
      if (!cal) return res.status(400).json({ message: "That calendar isn't in this Google account" });
      if (!cal.writable) return res.status(400).json({ message: `This Google account can't add events to "${cal.name}"` });
    }

    // Stop writing wherever jobs went before (this account or another one), cleaning up there.
    const previous = await prisma.googleConnection.findMany({ where: { job_calendar_id: { not: null } } });
    for (const p of previous) {
      if (p.id === conn.id && p.job_calendar_id === calendarId) continue;
      if (p.can_write) await removeJobEvents(p, p.job_calendar_id!);
      await prisma.googleConnection.update({ where: { id: p.id }, data: { job_calendar_id: null, push_error: null } });
    }
    if (!calendarId) return res.json({ job_calendar_id: null, pushed: 0, error: null });

    const updated = await prisma.googleConnection.update({
      where: { id: conn.id },
      data: { job_calendar_id: calendarId, push_error: null },
    });
    const result = await backfillJobs(updated);
    return res.json({ job_calendar_id: calendarId, ...result });
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      await prisma.googleConnection.update({ where: { id: req.params.id }, data: { last_error: err.message } }).catch(() => {});
      return res.status(409).json({ message: err.message });
    }
    if (err instanceof GoogleApiError) return res.status(502).json({ message: err.message });
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /calendar/google/:id: revoke access and remove its calendars and their events
// (and the job events it was adding to Google, which would otherwise go stale).
router.delete("/:id", async (req, res) => {
  try {
    const conn = await findConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Google account not found" });
    if (conn.job_calendar_id && conn.can_write) await removeJobEvents(conn, conn.job_calendar_id);
    const refreshToken = open(conn.refresh_token);
    if (refreshToken) await revokeToken(refreshToken);
    await prisma.googleConnection.delete({ where: { id: conn.id } });
    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
