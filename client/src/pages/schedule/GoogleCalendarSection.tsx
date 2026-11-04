import { useState } from "react";
import {
  useAddGoogleCalendar, useConnectGoogle, useDeleteCalendarSource, useDisconnectGoogle,
  useGoogleCalendars, useGoogleCalendarStatus, useSetJobCalendar, useSyncCalendarSource,
} from "../../lib/queries";
import { ApiError } from "../../lib/api";
import { formatDate } from "../../lib/utils";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import type { CalendarSource, GoogleCalendarInfo, GoogleConnection } from "../../types";

const sectionLabel = {
  fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
  textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: 8,
};

const helpText = { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 };
const smallBtn = { fontSize: 12, padding: "5px 10px" };

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Manager-only: connect Google accounts and pick which of their calendars to
 * sync (read-only), and optionally one calendar to add every job to (needs
 * write access, asked for separately). Renders nothing when the server has no
 * Google OAuth client set up.
 */
export function GoogleCalendarSection({ sources }: { sources: CalendarSource[] }) {
  const { showToast } = useToast();
  const { data: status } = useGoogleCalendarStatus();
  const connect = useConnectGoogle();

  if (!status?.configured) return null;

  async function handleConnect(write = false) {
    try {
      const { url } = await connect.mutateAsync({ write });
      window.location.assign(url);
    } catch (err) {
      showToast(errorText(err, "Couldn't start connecting Google"), "error");
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={sectionLabel}>Google Calendar · syncs automatically</p>
      <p style={helpText}>
        Sign in with Google to pick calendars to sync. Syncing only reads them. You can also have StageFlow
        add each job to one calendar; it only changes the job events it adds.
      </p>
      {status.connections.map((c) => (
        <ConnectionCard key={c.id} connection={c} sources={sources} onConnect={handleConnect} />
      ))}
      <button
        type="button"
        className="btn btn-outline btn-full"
        disabled={connect.isPending}
        onClick={() => handleConnect()}
      >
        {connect.isPending ? "Opening Google…" : status.connections.length ? "Connect another Google account" : "Connect Google Calendar"}
      </button>
    </div>
  );
}

function ConnectionCard({
  connection, sources, onConnect,
}: { connection: GoogleConnection; sources: CalendarSource[]; onConnect: (write?: boolean) => void }) {
  const { showToast } = useToast();
  const broken = !!connection.last_error;
  const { data: calendars, isLoading, error } = useGoogleCalendars(connection.id, !broken);
  const disconnect = useDisconnectGoogle();
  const [confirming, setConfirming] = useState(false);
  const synced = sources.filter((s) => s.google_connection_id === connection.id);

  async function handleDisconnect() {
    setConfirming(false);
    try {
      await disconnect.mutateAsync(connection.id);
      showToast(`Disconnected ${connection.google_email}`, "success");
    } catch (err) {
      showToast(errorText(err, "Couldn't disconnect"), "error");
    }
  }

  const listError = broken ? connection.last_error : error ? errorText(error, "Couldn't load calendars") : null;

  return (
    <div className="list-card" style={{ marginBottom: 10 }}>
      <div className="list-row" style={{ cursor: "default", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: "anywhere" }}>{connection.google_email}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
            Connected {formatDate(connection.created_at)}{connection.connector ? ` by ${connection.connector.name}` : ""}
          </div>
          {listError && <div style={{ fontSize: 11.5, color: "var(--red-text)", marginTop: 2 }}>{listError}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {listError && (
            // Keep write access when reconnecting an account that had it.
            <button className="btn btn-outline" style={smallBtn} onClick={() => onConnect(connection.can_write)}>Reconnect</button>
          )}
          <button className="btn btn-outline" style={{ ...smallBtn, color: "var(--red-text)" }}
            disabled={disconnect.isPending} onClick={() => setConfirming(true)}>
            Disconnect
          </button>
        </div>
      </div>

      {isLoading && !broken && (
        <div className="list-row" style={{ cursor: "default", fontSize: 13, color: "var(--text-tertiary)" }}>Loading calendars…</div>
      )}
      {calendars
        ? calendars.map((cal) => (
            <CalendarRow
              key={cal.id}
              connectionId={connection.id}
              calendar={cal}
              source={sources.find((s) => s.id === cal.source_id)}
            />
          ))
        : // Calendar list unavailable (e.g. access revoked): still show what's synced.
          synced.map((s) => (
            <CalendarRow
              key={s.id}
              connectionId={connection.id}
              calendar={{ id: s.google_calendar_id!, name: s.name, primary: false, color: null, writable: false, source_id: s.id }}
              source={s}
            />
          ))}

      {!broken && (
        <JobCalendarRow connection={connection} calendars={calendars} onAllowWrite={() => onConnect(true)} />
      )}

      {confirming && (
        <ConfirmDialog
          title={`Disconnect ${connection.google_email}?`}
          message={
            "StageFlow loses access to this Google account, and events from its calendars are removed from the schedule." +
            (connection.job_calendar_id ? " The job events StageFlow added to Google are removed too." : "")
          }
          confirmLabel="Disconnect"
          confirmDanger
          onConfirm={handleDisconnect}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function CalendarRow({
  connectionId, calendar, source,
}: { connectionId: string; calendar: GoogleCalendarInfo; source?: CalendarSource }) {
  const { showToast } = useToast();
  const add = useAddGoogleCalendar(connectionId);
  const sync = useSyncCalendarSource();
  const remove = useDeleteCalendarSource();

  async function handleAdd() {
    try {
      const r = await add.mutateAsync({ calendar_id: calendar.id, name: calendar.name });
      showToast(`Syncing ${calendar.name}: ${r.created} events added`, "success");
    } catch (err) {
      showToast(errorText(err, "Couldn't sync that calendar"), "error");
    }
  }

  async function handleSync() {
    try {
      const r = await sync.mutateAsync(source!.id);
      if (r.error) showToast(`Sync failed: ${r.error}`, "error");
      else showToast(`Synced: ${r.created} new, ${r.updated} updated, ${r.removed} removed`, "success");
    } catch (err) {
      showToast(errorText(err, "Sync failed"), "error");
    }
  }

  async function handleRemove() {
    try {
      await remove.mutateAsync(source!.id);
      showToast(`Stopped syncing ${calendar.name}`, "success");
    } catch (err) {
      showToast(errorText(err, "Couldn't stop syncing"), "error");
    }
  }

  return (
    <div className="list-row" style={{ cursor: "default", alignItems: "flex-start", paddingLeft: 24 }}>
      <span
        style={{
          width: 10, height: 10, borderRadius: 3, flexShrink: 0, marginTop: 4,
          background: calendar.color ?? "var(--text-tertiary)", opacity: source ? 1 : 0.4,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: source ? "var(--text-primary)" : "var(--text-secondary)", overflowWrap: "anywhere" }}>
          {calendar.name}
          {calendar.primary && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}> · main</span>}
        </div>
        {source && (
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
            {source.event_count} events · {source.last_synced_at ? `synced ${formatDate(source.last_synced_at)}` : "not synced yet"}
          </div>
        )}
        {source?.last_error && (
          <div style={{ fontSize: 11.5, color: "var(--red-text)", marginTop: 2 }}>{source.last_error}</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {source ? (
          <>
            <button className="btn btn-outline" style={smallBtn} disabled={sync.isPending} onClick={handleSync}>
              {sync.isPending ? "Syncing…" : "Sync"}
            </button>
            <button className="btn btn-outline" style={{ ...smallBtn, color: "var(--red-text)" }}
              disabled={remove.isPending} onClick={handleRemove}>
              Stop
            </button>
          </>
        ) : (
          <button className="btn btn-outline" style={smallBtn} disabled={add.isPending} onClick={handleAdd}>
            {add.isPending ? "Adding…" : "Sync"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "Add jobs to Google Calendar": each job's staging day and destage day go to
 * one calendar and follow the job as it changes. Needs write access, which
 * the account grants through Google's consent screen.
 */
function JobCalendarRow({
  connection, calendars, onAllowWrite,
}: { connection: GoogleConnection; calendars?: GoogleCalendarInfo[]; onAllowWrite: () => void }) {
  const { showToast } = useToast();
  const setJobCalendar = useSetJobCalendar(connection.id);
  // A change that removes events from the current calendar waits for confirmation.
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const current = connection.job_calendar_id;
  const writable = calendars?.filter((c) => c.writable || c.id === current) ?? [];
  const nameOf = (id: string) => calendars?.find((c) => c.id === id)?.name ?? id;

  async function apply(calendarId: string | null) {
    setPending(undefined);
    try {
      const r = await setJobCalendar.mutateAsync(calendarId);
      if (!calendarId) showToast("Stopped adding jobs to Google Calendar", "success");
      else if (r.error) showToast(`Couldn't add jobs: ${r.error}`, "error");
      else showToast(`Adding jobs to ${nameOf(calendarId)}: ${r.pushed} upcoming ${r.pushed === 1 ? "job" : "jobs"} added`, "success");
    } catch (err) {
      showToast(errorText(err, "Couldn't change where jobs are added"), "error");
    }
  }

  function choose(value: string) {
    const next = value || null;
    if (next === current) return;
    if (current) setPending(next);
    else void apply(next);
  }

  return (
    <div className="list-row" style={{ cursor: "default", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
      <div style={{ flex: "1 1 180px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>Add jobs to Google Calendar</div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, lineHeight: 1.4 }}>
          Each job's staging day and destage day, updated when the job changes.
        </div>
        {connection.push_error && (
          <div style={{ fontSize: 11.5, color: "var(--red-text)", marginTop: 2 }}>{connection.push_error}</div>
        )}
      </div>
      {!connection.can_write ? (
        <button className="btn btn-outline" style={{ ...smallBtn, flexShrink: 0 }} onClick={onAllowWrite}>
          Allow
        </button>
      ) : calendars ? (
        <select
          className="input-field"
          style={{ flex: "0 1 200px", minWidth: 0, fontSize: 13, padding: "5px 8px" }}
          aria-label="Calendar to add jobs to"
          value={current ?? ""}
          disabled={setJobCalendar.isPending}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">Off</option>
          {writable.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.primary ? " (main)" : ""}</option>
          ))}
        </select>
      ) : null}

      {pending !== undefined && current && (
        <ConfirmDialog
          title={pending ? `Add jobs to ${nameOf(pending)} instead?` : "Stop adding jobs to Google?"}
          message={`The job events StageFlow added to ${nameOf(current)} are removed from it.`}
          confirmLabel={pending ? "Switch" : "Stop"}
          confirmDanger={!pending}
          onConfirm={() => apply(pending)}
          onCancel={() => setPending(undefined)}
        />
      )}
    </div>
  );
}
