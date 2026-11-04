import { useState } from "react";
import {
  useAddGoogleCalendar, useConnectGoogle, useDeleteCalendarSource, useDisconnectGoogle,
  useGoogleCalendars, useGoogleCalendarStatus, useSyncCalendarSource,
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
 * Manager-only: connect Google accounts (read-only OAuth) and pick which of
 * their calendars to sync. Renders nothing when the server has no Google
 * OAuth client set up.
 */
export function GoogleCalendarSection({ sources }: { sources: CalendarSource[] }) {
  const { showToast } = useToast();
  const { data: status } = useGoogleCalendarStatus();
  const connect = useConnectGoogle();

  if (status?.config_error) {
    return (
      <div style={{ marginBottom: 20 }}>
        <p style={sectionLabel}>Google Calendar</p>
        <p style={{ ...helpText, color: "var(--red-text)" }}>
          Google Calendar is turned off because the server's settings are wrong: {status.config_error}. Fix it in
          the server's environment variables and redeploy.
        </p>
      </div>
    );
  }
  if (!status?.configured) return null;

  async function handleConnect() {
    try {
      const { url } = await connect.mutateAsync();
      window.location.assign(url);
    } catch (err) {
      showToast(errorText(err, "Couldn't start connecting Google"), "error");
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={sectionLabel}>Google Calendar · syncs automatically</p>
      <p style={helpText}>
        Sign in with Google to pick calendars to sync. StageFlow can only read them, never change them.
      </p>
      {status.connections.map((c) => (
        <ConnectionCard key={c.id} connection={c} sources={sources} onReconnect={handleConnect} />
      ))}
      <button
        type="button"
        className="btn btn-outline btn-full"
        disabled={connect.isPending}
        onClick={handleConnect}
      >
        {connect.isPending ? "Opening Google…" : status.connections.length ? "Connect another Google account" : "Connect Google Calendar"}
      </button>
    </div>
  );
}

function ConnectionCard({
  connection, sources, onReconnect,
}: { connection: GoogleConnection; sources: CalendarSource[]; onReconnect: () => void }) {
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
            <button className="btn btn-outline" style={smallBtn} onClick={onReconnect}>Reconnect</button>
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
              calendar={{ id: s.google_calendar_id!, name: s.name, primary: false, color: null, source_id: s.id }}
              source={s}
            />
          ))}

      {confirming && (
        <ConfirmDialog
          title={`Disconnect ${connection.google_email}?`}
          message="StageFlow loses access to this Google account, and events from its calendars are removed from the schedule."
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
