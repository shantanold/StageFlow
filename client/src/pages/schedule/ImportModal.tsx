import { useRef, useState, FormEvent, ChangeEvent } from "react";
import {
  useAddCalendarSource, useCalendarSettings, useCalendarSources, useDeleteCalendarSource,
  useImportIcs, useSyncCalendarSource, useUpdateCalendarSettings,
} from "../../lib/queries";
import { ApiError } from "../../lib/api";
import { formatDate } from "../../lib/utils";
import { ModalOverlay } from "../../components/ModalOverlay";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import type { CalendarSource } from "../../types";

const sectionLabel = {
  fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
  textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: 8,
};

const helpText = { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 };

function timeZones(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const all = intl.supportedValuesOf?.("timeZone") ?? [];
  return all.includes(current) ? all : [current, ...all];
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Manager-only: upload .ics files, subscribe to calendar links, set the business time zone. */
export function ImportModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const importIcs = useImportIcs();
  const { data: sources = [], isLoading: sourcesLoading } = useCalendarSources();
  const addSource = useAddCalendarSource();
  const syncSource = useSyncCalendarSource();
  const deleteSource = useDeleteCalendarSource();
  const { data: settings } = useCalendarSettings();
  const updateSettings = useUpdateCalendarSettings();

  const [link, setLink] = useState({ name: "", url: "" });
  const [linkError, setLinkError] = useState("");
  const [fileError, setFileError] = useState("");
  const [removing, setRemoving] = useState<CalendarSource | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError("");
    try {
      const text = await file.text();
      const r = await importIcs.mutateAsync(text);
      showToast(
        r.total === 0
          ? "No events in that file between 90 days ago and a year from now"
          : `Imported ${r.created} new, updated ${r.updated}`,
        r.total === 0 ? "info" : "success"
      );
    } catch (err) {
      setFileError(errorText(err, "Couldn't import that file"));
    }
  }

  async function handleSubscribe(e: FormEvent) {
    e.preventDefault();
    setLinkError("");
    if (!link.url.trim()) return setLinkError("Paste the calendar link");
    try {
      const r = await addSource.mutateAsync({ name: link.name.trim() || undefined, url: link.url.trim() });
      setLink({ name: "", url: "" });
      showToast(`Subscribed — ${r.created} events added`, "success");
    } catch (err) {
      setLinkError(errorText(err, "Couldn't subscribe to that link"));
    }
  }

  async function handleSync(id: string) {
    try {
      const r = await syncSource.mutateAsync(id);
      if (r.error) showToast(`Sync failed: ${r.error}`, "error");
      else showToast(`Synced: ${r.created} new, ${r.updated} updated, ${r.removed} removed`, "success");
    } catch (err) {
      showToast(errorText(err, "Sync failed"), "error");
    }
  }

  async function handleRemove() {
    const source = removing!;
    setRemoving(null);
    try {
      await deleteSource.mutateAsync(source.id);
      showToast(`Removed ${source.name}`, "success");
    } catch (err) {
      showToast(errorText(err, "Couldn't remove that calendar"), "error");
    }
  }

  async function handleTimeZone(tz: string) {
    try {
      await updateSettings.mutateAsync({ timezone: tz });
      showToast(`Time zone set to ${tz.replace(/_/g, " ")}`, "success");
    } catch (err) {
      showToast(errorText(err, "Couldn't change the time zone"), "error");
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Import calendars</div>

        {/* ── Subscribe ── */}
        <p style={sectionLabel}>Subscribe by link · stays in sync</p>
        <p style={helpText}>
          <strong>Google Calendar:</strong> Settings → pick the calendar → Integrate calendar →
          “Secret address in iCal format”.
          <br />
          <strong>Apple Calendar (iCloud):</strong> tap the calendar’s share icon → turn on Public Calendar → Copy Link.
        </p>
        <form onSubmit={handleSubscribe} style={{ marginBottom: 12 }}>
          <input
            className="input-field"
            style={{ marginBottom: 8 }}
            placeholder="https://… or webcal://…"
            value={link.url}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setLink({ ...link, url: e.target.value })}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input-field"
              placeholder="Name (optional), e.g. Office"
              value={link.name}
              onChange={(e) => setLink({ ...link, name: e.target.value })}
            />
            <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }} disabled={addSource.isPending}>
              {addSource.isPending ? "Adding…" : "Subscribe"}
            </button>
          </div>
          {linkError && <p style={{ color: "var(--red-text)", fontSize: 13, marginTop: 8 }}>{linkError}</p>}
        </form>

        {sourcesLoading ? null : sources.length > 0 && (
          <div className="list-card" style={{ marginBottom: 20 }}>
            {sources.map((s) => (
              <div key={s.id} className="list-row" style={{ cursor: "default", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {s.event_count} events · {s.last_synced_at ? `synced ${formatDate(s.last_synced_at)}` : "not synced yet"}
                  </div>
                  {s.last_error && (
                    <div style={{ fontSize: 11.5, color: "var(--red-text)", marginTop: 2 }}>{s.last_error}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 12, padding: "5px 10px" }}
                    disabled={syncSource.isPending && syncSource.variables === s.id}
                    onClick={() => handleSync(s.id)}
                  >
                    {syncSource.isPending && syncSource.variables === s.id ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 12, padding: "5px 10px", color: "var(--red-text)" }}
                    onClick={() => setRemoving(s)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {sources.length === 0 && <div style={{ marginBottom: 20 }} />}

        {/* ── File upload ── */}
        <p style={sectionLabel}>Upload a file · one-time copy</p>
        <p style={helpText}>
          <strong>Apple Calendar (Mac):</strong> select the calendar → File → Export → Export….
          <br />
          <strong>Google Calendar:</strong> Settings → Import &amp; export → Export, then unzip and pick a .ics file.
          <br />
          Events from 90 days ago to a year ahead are imported. Importing the same file again updates them instead of
          adding duplicates.
        </p>
        <input ref={fileRef} type="file" accept=".ics,text/calendar" style={{ display: "none" }} onChange={handleFile} />
        <button
          type="button"
          className="btn btn-outline btn-full"
          style={{ marginBottom: fileError ? 8 : 20 }}
          disabled={importIcs.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {importIcs.isPending ? "Importing…" : "Choose .ics file"}
        </button>
        {fileError && <p style={{ color: "var(--red-text)", fontSize: 13, marginBottom: 20 }}>{fileError}</p>}

        {/* ── Time zone ── */}
        <p style={sectionLabel}>Business time zone</p>
        <p style={helpText}>Used for working hours when offering appointment times, and for imported events without a time zone.</p>
        {settings && (
          <select
            className="input-field"
            style={{ marginBottom: 20 }}
            value={settings.timezone}
            disabled={updateSettings.isPending}
            onChange={(e) => handleTimeZone(e.target.value)}
          >
            {timeZones(settings.timezone).map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </select>
        )}

        <button type="button" className="btn btn-outline btn-full" onClick={onClose}>
          Done
        </button>
      </div>

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message={`Its ${removing.event_count} events will be removed from the schedule.`}
          confirmLabel="Remove"
          confirmDanger
          onConfirm={handleRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </ModalOverlay>
  );
}
