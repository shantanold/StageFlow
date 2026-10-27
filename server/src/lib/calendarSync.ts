import type { CalendarSource, EventSource } from "@prisma/client";
import { prisma, rawPrisma } from "./prisma";
import { getCurrentOrgId, runWithOrg } from "./tenantContext";
import { defaultImportWindow, parseIcs, type ParsedEvent } from "./ics";
import { fetchIcs } from "./icsFetch";

/**
 * Writes parsed calendar events into the current org (tenant-scoped client),
 * matching existing rows by external UID so re-imports update in place.
 * Only the fields the external calendar owns are overwritten; a job link or
 * assignee added in StageFlow survives a re-import.
 */
export async function upsertImportedEvents(
  events: ParsedEvent[],
  opts: { source: EventSource; sourceId?: string; userId?: string }
) {
  const uids = events.map((e) => e.external_uid);
  const existing = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 1000) {
    const rows = await prisma.event.findMany({
      where: { external_uid: { in: uids.slice(i, i + 1000) } },
      select: { id: true, external_uid: true },
    });
    for (const r of rows) existing.set(r.external_uid!, r.id);
  }

  const orgId = getCurrentOrgId()!;
  const toCreate = events.filter((e) => !existing.has(e.external_uid));
  const toUpdate = events.filter((e) => existing.has(e.external_uid));

  for (let i = 0; i < toCreate.length; i += 500) {
    await prisma.event.createMany({
      data: toCreate.slice(i, i + 500).map((e) => ({
        ...e,
        org_id: orgId,
        source: opts.source,
        source_id: opts.sourceId ?? null,
        created_by: opts.userId ?? null,
      })),
      skipDuplicates: true,
    });
  }

  for (let i = 0; i < toUpdate.length; i += 100) {
    await prisma.$transaction(
      toUpdate.slice(i, i + 100).map((e) =>
        prisma.event.update({
          where: { id: existing.get(e.external_uid)! },
          data: {
            title: e.title,
            description: e.description,
            location: e.location,
            start_at: e.start_at,
            end_at: e.end_at,
            all_day: e.all_day,
            is_busy: e.is_busy,
            // A subscription adopts matching events (e.g. from an earlier file upload).
            ...(opts.sourceId && { source: opts.source, source_id: opts.sourceId }),
          },
        })
      )
    );
  }

  return { created: toCreate.length, updated: toUpdate.length };
}

/**
 * Re-downloads one subscribed feed and mirrors it: new and changed events are
 * upserted, and future events that disappeared from the feed are removed.
 * Past events outside the import window are left alone as history.
 * Must run inside the source's org context. Never throws for feed problems;
 * the error is stored on the source instead.
 */
export async function syncCalendarSource(source: CalendarSource, now = new Date()) {
  const org = await rawPrisma.organization.findUnique({ where: { id: source.org_id }, select: { timezone: true } });
  const window = defaultImportWindow(now);
  try {
    const text = await fetchIcs(source.url);
    const events = parseIcs(text, { ...window, fallbackTimeZone: org?.timezone ?? "America/Chicago" });
    const result = await upsertImportedEvents(events, { source: "ics_url", sourceId: source.id });
    const removed = await prisma.event.deleteMany({
      where: {
        source_id: source.id,
        start_at: { gte: window.windowStart },
        external_uid: { notIn: events.map((e) => e.external_uid) },
      },
    });
    const count = await prisma.event.count({ where: { source_id: source.id } });
    const updated = await prisma.calendarSource.update({
      where: { id: source.id },
      data: { last_synced_at: now, last_error: null, event_count: count },
    });
    return { source: updated, ...result, removed: removed.count, error: null as string | null };
  } catch (err) {
    const message = (err as Error).message || "Sync failed";
    console.error(`calendar sync failed for source ${source.id}:`, message);
    const updated = await prisma.calendarSource.update({
      where: { id: source.id },
      data: { last_synced_at: now, last_error: message.slice(0, 500) },
    });
    return { source: updated, created: 0, updated: 0, removed: 0, error: message };
  }
}

/**
 * Background refresh of every subscription not synced within `maxAgeMs`,
 * across all orgs (system job, hence rawPrisma for the lookup; each sync then
 * runs inside its own org's tenant context).
 */
export async function syncStaleCalendarSources(maxAgeMs: number) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await rawPrisma.calendarSource.findMany({
    where: {
      org: { is_active: true },
      OR: [{ last_synced_at: null }, { last_synced_at: { lt: cutoff } }],
    },
  });
  for (const source of stale) {
    await runWithOrg(source.org_id, () => syncCalendarSource(source));
  }
  return stale.length;
}
