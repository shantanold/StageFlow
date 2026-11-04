import crypto from "crypto";
import type { ParsedEvent } from "./ics";
import { hasSecretKey } from "./secretBox";

/**
 * Google Calendar read-only access over plain fetch (no googleapis package).
 * Configured by GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 * GOOGLE_OAUTH_REDIRECT_URI and CALENDAR_TOKEN_KEY.
 */

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 15_000;
const MAX_EVENTS = 5000;

/** Google refused the stored refresh token (revoked, expired, or app access removed): reconnect needed. */
export class GoogleAuthError extends Error {}
/** Any other Google API failure. */
export class GoogleApiError extends Error {}

export const RECONNECT_MESSAGE = "Google access expired or was revoked. Reconnect Google to keep syncing.";

export function googleConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI &&
    hasSecretKey()
  );
}

/** PKCE pair (RFC 7636, S256). */
export function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizationUrl(state: string, codeChallenge: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    // offline + consent so Google always returns a refresh token, even on reconnect.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

async function call(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new GoogleApiError(
      (err as Error).name === "TimeoutError" ? "Google didn't respond in time" : "Couldn't reach Google"
    );
  }
}

async function tokenRequest(body: Record<string, string>) {
  const res = await call(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant") throw new GoogleAuthError(RECONNECT_MESSAGE);
    throw new GoogleApiError(`Google sign-in failed${json.error ? ` (${json.error})` : ""}`);
  }
  return json;
}

/** Exchanges the callback's code. Fails unless Google granted a refresh token and both calendar scopes. */
export async function exchangeCode(code: string, codeVerifier: string) {
  const tokens = await tokenRequest({
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
  });
  const granted = new Set((tokens.scope ?? "").split(" "));
  if (!GOOGLE_SCOPES.every((s) => granted.has(s))) {
    throw new GoogleApiError("Calendar access wasn't granted. Connect again and leave both calendar boxes checked.");
  }
  if (!tokens.refresh_token) throw new GoogleApiError("Google didn't return a refresh token. Try connecting again.");
  return { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token };
}

export async function refreshAccessToken(refreshToken: string) {
  const tokens = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return tokens.access_token!;
}

/** Best effort: the connection is removed locally whether or not Google confirms. */
export async function revokeToken(token: string) {
  try {
    await call(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // ignore
  }
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await call(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new GoogleAuthError(RECONNECT_MESSAGE);
  if (res.status === 404) throw new GoogleApiError("That calendar no longer exists or isn't shared with this Google account");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleApiError(`Google Calendar error ${res.status}${body.error?.message ? `: ${body.error.message}` : ""}`);
  }
  return (await res.json()) as T;
}

export interface GoogleCalendarInfo {
  id: string;
  name: string;
  primary: boolean;
  color: string | null;
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendarInfo[]> {
  const out: GoogleCalendarInfo[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ maxResults: "250", ...(pageToken && { pageToken }) });
    const page = await getJson<{
      items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; backgroundColor?: string }[];
      nextPageToken?: string;
    }>(`${API}/users/me/calendarList?${params}`, accessToken);
    for (const c of page.items ?? []) {
      out.push({
        id: c.id,
        name: c.summaryOverride || c.summary || c.id,
        primary: !!c.primary,
        color: c.backgroundColor ?? null,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  // Primary first, then by name.
  return out.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

type GoogleTime = { date?: string; dateTime?: string };

export interface GoogleEvent {
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  transparency?: string;
  iCalUID?: string;
  id: string;
  recurringEventId?: string;
  originalStartTime?: GoogleTime;
  eventType?: string;
}

/** yyyy-MM-dd as UTC midnight (the app's date-only convention). */
function dayToUtc(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Converts one Google event to the shape ICS imports use. The external UID
 * matches what the same event gets from Google's ICS feed (iCalUID, plus
 * "#<original start>" for an occurrence of a repeating event), so switching a
 * calendar from an ICS subscription to Google sync updates events in place.
 * Returns null for events to skip (cancelled, working-location markers, bad dates).
 */
export function toParsedEvent(ev: GoogleEvent): ParsedEvent | null {
  if (ev.status === "cancelled" || ev.eventType === "workingLocation") return null;
  const allDay = !!ev.start?.date;
  const start = allDay ? dayToUtc(ev.start!.date!) : ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
  let end = allDay
    ? ev.end?.date ? dayToUtc(ev.end.date) : null
    : ev.end?.dateTime ? new Date(ev.end.dateTime) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  if (!end || Number.isNaN(end.getTime()) || end < start || (allDay && end <= start)) {
    end = allDay ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : start;
  }

  const uid = ev.iCalUID || ev.id;
  let externalUid = uid;
  if (ev.recurringEventId) {
    const orig = ev.originalStartTime;
    const key = orig?.date ?? (orig?.dateTime ? new Date(orig.dateTime).toISOString() : start.toISOString());
    externalUid = `${uid}#${key}`;
  }

  return {
    external_uid: externalUid.slice(0, 1000),
    title: (ev.summary?.trim() || "(No title)").slice(0, 500),
    description: ev.description?.trim().slice(0, 5000) || null,
    location: ev.location?.trim().slice(0, 500) || null,
    start_at: start,
    end_at: end,
    all_day: allDay,
    is_busy: ev.transparency !== "transparent",
  };
}

/** Every event in [timeMin, timeMax), repeating events expanded into occurrences. */
export async function listEvents(accessToken: string, calendarId: string, timeMin: Date, timeMax: Date) {
  const out: ParsedEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      maxResults: "2500",
      ...(pageToken && { pageToken }),
    });
    const page = await getJson<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      accessToken
    );
    for (const ev of page.items ?? []) {
      const parsed = toParsedEvent(ev);
      if (parsed) out.push(parsed);
      if (out.length >= MAX_EVENTS) return out;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}
