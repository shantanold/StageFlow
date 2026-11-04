import type { GoogleConnection, Job } from "@prisma/client";
import { prisma } from "./prisma";
import { getCurrentOrgId } from "./tenantContext";
import { open } from "./secretBox";
import {
  deleteJobEvent, GoogleApiError, GoogleAuthError, jobEventId, listJobEventIds, putJobEvent,
  refreshAccessToken, RECONNECT_MESSAGE, type JobEventBody,
} from "./googleCalendar";

/**
 * Writes each job's staging day and destage day to the one Google calendar a
 * manager picked (GoogleConnection.job_calendar_id), and keeps them current
 * as the job changes. StageFlow is the source of truth: edits made to these
 * events in Google are overwritten on the next job change.
 *
 * Everything here is best effort and never throws: a Google problem must not
 * block saving a job. Failures are stored on the connection (push_error, or
 * last_error when access was revoked) for the Google Calendar settings to show.
 * Must run inside the job's org context.
 */

/** Only upcoming work is copied when the calendar is first picked; finished jobs stay out of it. */
const BACKFILL_STATUSES = ["planning", "active"] as const;
/** Parallel Google requests while backfilling or cleaning up. */
const CONCURRENCY = 4;

interface Target {
  conn: GoogleConnection;
  calendarId: string;
  accessToken: string;
}

function day(d: Date) {
  return d.toISOString().slice(0, 10);
}

function jobLocation(job: Job) {
  const cityLine = [job.city, [job.state, job.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [job.address, cityLine].filter(Boolean).join(", ");
}

/** The two all-day events a job puts on the calendar. */
export function jobEvents(job: Job): { id: string; body: JobEventBody }[] {
  const details = [
    `Client: ${job.client_name}`,
    job.client_contact && `Contact: ${job.client_contact}`,
    job.notes && `\n${job.notes}`,
  ].filter(Boolean).join("\n");
  const footer = "\n\nAdded by StageFlow. Edit the job in StageFlow; changes made here are overwritten.";
  const destaged = !!job.destaged_at;
  const common = { location: jobLocation(job), jobId: job.id, orgId: job.org_id };
  return [
    {
      id: jobEventId(job.id, "stage"),
      body: { ...common, summary: `Staging: ${job.address}`, day: day(job.start_date), description: details + footer },
    },
    {
      id: jobEventId(job.id, "destage"),
      body: {
        ...common,
        summary: `Destage: ${job.address}`,
        day: day(job.destaged_at ?? job.expected_end_date),
        description: `${destaged ? "Destaged" : "Expected close date"}\n${details}${footer}`,
      },
    },
  ];
}

async function recordResult(conn: GoogleConnection, err: unknown) {
  if (!err) {
    if (conn.push_error) await prisma.googleConnection.update({ where: { id: conn.id }, data: { push_error: null } });
    return;
  }
  const message = ((err as Error).message || "Couldn't update Google Calendar").slice(0, 500);
  if (!(err instanceof GoogleAuthError || err instanceof GoogleApiError)) console.error("google job push", err);
  await prisma.googleConnection.update({
    where: { id: conn.id },
    data: err instanceof GoogleAuthError ? { last_error: message, push_error: message } : { push_error: message },
  }).catch(() => {});
}

async function accessFor(conn: GoogleConnection) {
  const refreshToken = open(conn.refresh_token);
  if (!refreshToken) throw new GoogleAuthError(RECONNECT_MESSAGE);
  return refreshAccessToken(refreshToken);
}

/** The org's push target, or null when adding jobs to Google is off. */
async function findTarget(): Promise<Omit<Target, "accessToken"> | null> {
  const conn = await prisma.googleConnection.findFirst({
    where: { job_calendar_id: { not: null }, can_write: true },
  });
  return conn ? { conn, calendarId: conn.job_calendar_id! } : null;
}

/** Brings one job's events in line with the job: written while it's live, removed once deleted or cancelled. */
async function reconcile(t: Target, jobId: string, job: Job | null) {
  if (!job || job.status === "cancelled") {
    for (const kind of ["stage", "destage"] as const) {
      await deleteJobEvent(t.accessToken, t.calendarId, jobEventId(jobId, kind));
    }
    return;
  }
  for (const ev of jobEvents(job)) await putJobEvent(t.accessToken, t.calendarId, ev.id, ev.body);
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
}

/**
 * Call after any change to a job (create, edit, completion, delete). Looks
 * the job up again, so a deleted job's events are removed. A no-op (one
 * query) when no calendar is picked.
 */
export async function syncJobToGoogle(jobId: string) {
  let target: Omit<Target, "accessToken"> | null = null;
  try {
    target = await findTarget();
    if (!target) return;
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    await reconcile({ ...target, accessToken: await accessFor(target.conn) }, jobId, job);
    await recordResult(target.conn, null);
  } catch (err) {
    if (target) await recordResult(target.conn, err);
    else console.error("google job push", err);
  }
}

/** Writes every planning and active job to a newly picked calendar. */
export async function backfillJobs(conn: GoogleConnection) {
  try {
    const t: Target = { conn, calendarId: conn.job_calendar_id!, accessToken: await accessFor(conn) };
    const jobs = await prisma.job.findMany({ where: { status: { in: [...BACKFILL_STATUSES] } } });
    await inBatches(jobs, (job) => reconcile(t, job.id, job));
    await recordResult(conn, null);
    return { pushed: jobs.length, error: null as string | null };
  } catch (err) {
    await recordResult(conn, err);
    return { pushed: 0, error: (err as Error).message || "Couldn't add jobs to Google Calendar" };
  }
}

/**
 * Removes every job event this org wrote to a calendar, used when the
 * calendar stops being kept up to date (switched, turned off, disconnected):
 * events that no longer follow the job would go stale. Best effort.
 */
export async function removeJobEvents(conn: GoogleConnection, calendarId: string) {
  try {
    const accessToken = await accessFor(conn);
    const ids = await listJobEventIds(accessToken, calendarId, getCurrentOrgId()!);
    await inBatches(ids, (id) => deleteJobEvent(accessToken, calendarId, id));
    return ids.length;
  } catch (err) {
    console.error(`couldn't remove job events from ${conn.google_email}:`, (err as Error).message);
    return 0;
  }
}
