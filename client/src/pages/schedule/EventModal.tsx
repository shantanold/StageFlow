import { useState, FormEvent } from "react";
import { useCalendarPeople, useDeleteEvent, useJobs, useSaveEvent } from "../../lib/queries";
import { ApiError } from "../../lib/api";
import { ModalOverlay } from "../../components/ModalOverlay";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { defaultFormTimes, formTimesFromEvent, formTimesToApi, sourceLabel, type EventFormTimes } from "../../lib/schedule";
import type { CalendarEvent } from "../../types";

interface EventModalProps {
  /** Existing event to edit; omit to create one on `day`. */
  event?: CalendarEvent;
  day: string;
  onClose: () => void;
}

export function EventModal({ event, day, onClose }: EventModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const save = useSaveEvent(event?.id);
  const del = useDeleteEvent();
  const { data: people = [] } = useCalendarPeople();
  const { data: jobs = [] } = useJobs();

  const imported = !!event && event.source !== "manual";
  const canEdit =
    !event || user?.role === "manager" || event.created_by === user?.id || event.assignee_id === user?.id;

  const [times, setTimes] = useState<EventFormTimes>(event ? formTimesFromEvent(event) : defaultFormTimes(day));
  const [form, setForm] = useState({
    title: event?.title ?? "",
    location: event?.location ?? "",
    description: event?.description ?? "",
    job_id: event?.job_id ?? "",
    assignee_id: event?.assignee_id ?? (event ? "" : user?.id ?? ""),
    is_busy: event?.is_busy ?? true,
  });
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The current link stays selectable even if that job is no longer open.
  const jobOptions = jobs.filter(
    (j) => j.status === "planning" || j.status === "active" || j.id === form.job_id
  );

  function setTime<K extends keyof EventFormTimes>(key: K, value: EventFormTimes[K]) {
    setTimes((t) => {
      const next = { ...t, [key]: value };
      // Keep the end on or after the start when the start moves past it.
      if (key === "startDate" && next.endDate < (value as string)) next.endDate = value as string;
      return next;
    });
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    const links = {
      job_id: form.job_id || null,
      assignee_id: form.assignee_id || null,
      is_busy: form.is_busy,
    };
    try {
      if (imported) {
        await save.mutateAsync(links);
      } else {
        if (!form.title.trim()) return setError("Add a title");
        const when = formTimesToApi(times);
        if (typeof when === "string") return setError(when);
        await save.mutateAsync({
          ...links,
          ...when,
          all_day: times.allDay,
          title: form.title.trim(),
          location: form.location.trim() || null,
          description: form.description.trim() || null,
        });
      }
      showToast(event ? "Event updated" : "Event added", "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the event");
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    try {
      await del.mutateAsync(event!.id);
      showToast("Event deleted", "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete the event");
    }
  }

  const readOnlyTimes = imported || !canEdit;
  const from = event ? sourceLabel(event) : null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>
          {event ? (canEdit ? "Edit event" : "Event") : "New event"}
        </div>
        {event && from && (
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 12, lineHeight: 1.5 }}>
            {event.source === "ics_file" ? "Imported from a calendar file" : <>From <strong style={{ color: "var(--text-secondary)" }}>{from}</strong></>}. Change the title or time in the
            original calendar; here you can link a job, assign someone and set whether it blocks availability.
          </p>
        )}
        <form onSubmit={handleSave} style={{ marginTop: event && from ? 0 : 12 }}>
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Title</label>
            <input
              className="input-field"
              value={form.title}
              disabled={readOnlyTimes}
              placeholder="e.g. Staging consult"
              autoFocus={!event}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={times.allDay}
              disabled={readOnlyTimes}
              onChange={(e) => setTime("allDay", e.target.checked)}
            />
            All day
          </label>

          {times.allDay ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, marginBottom: 14 }}>
              <div>
                <label className="form-label">Starts</label>
                <input className="input-field" type="date" value={times.startDate} disabled={readOnlyTimes}
                  onChange={(e) => setTime("startDate", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Ends</label>
                <input className="input-field" type="date" value={times.endDate} disabled={readOnlyTimes}
                  onChange={(e) => setTime("endDate", e.target.value)} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <div style={{ marginBottom: 8 }}>
                <label className="form-label">Date</label>
                <input className="input-field" type="date" value={times.startDate} disabled={readOnlyTimes}
                  onChange={(e) => {
                    // Timed events usually stay on one day; move the end date with the start.
                    const v = e.target.value;
                    setTimes((t) => ({ ...t, startDate: v, endDate: t.endDate === t.startDate ? v : t.endDate < v ? v : t.endDate }));
                  }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
                <div>
                  <label className="form-label">From</label>
                  <input className="input-field" type="time" value={times.startTime} disabled={readOnlyTimes}
                    onChange={(e) => setTime("startTime", e.target.value)} />
                </div>
                <div>
                  <label className="form-label">To</label>
                  <input className="input-field" type="time" value={times.endTime} disabled={readOnlyTimes}
                    onChange={(e) => setTime("endTime", e.target.value)} />
                </div>
              </div>
              {times.endDate !== times.startDate && (
                <div style={{ marginTop: 8 }}>
                  <label className="form-label">Ends on</label>
                  <input className="input-field" type="date" value={times.endDate} disabled={readOnlyTimes}
                    onChange={(e) => setTime("endDate", e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Location</label>
            <input className="input-field" value={form.location} disabled={readOnlyTimes} placeholder="Address or meeting link"
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, marginBottom: 14 }}>
            <div>
              <label className="form-label">Job</label>
              <select className="input-field" value={form.job_id} disabled={!canEdit}
                onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
                <option value="">None</option>
                {jobOptions.map((j) => (
                  <option key={j.id} value={j.id}>{j.address}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Assigned to</label>
              <select className="input-field" value={form.assignee_id} disabled={!canEdit}
                onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                <option value="">Anyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 14, color: "var(--text-secondary)", lineHeight: 1.4 }}>
            <input type="checkbox" checked={form.is_busy} disabled={!canEdit} style={{ marginTop: 2 }}
              onChange={(e) => setForm({ ...form, is_busy: e.target.checked })} />
            <span>
              Busy
              <span style={{ display: "block", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                Busy time isn't offered when booking appointments.
              </span>
            </span>
          </label>

          <div style={{ marginBottom: 20 }}>
            <label className="form-label">Notes</label>
            <textarea className="input-field" rows={3} value={form.description} disabled={readOnlyTimes}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {error && <p style={{ color: "var(--red-text)", fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            {event && canEdit && (
              <button type="button" className="btn btn-outline" style={{ color: "var(--red-text)" }}
                disabled={del.isPending} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
            <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
              {canEdit ? "Cancel" : "Close"}
            </button>
            {canEdit && (
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={save.isPending}>
                {save.isPending ? "Saving…" : event ? "Save" : "Add event"}
              </button>
            )}
          </div>
        </form>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${event!.title}"?`}
          message={
            event!.source === "ics_url"
              ? "It came from a subscribed calendar, so the next sync will add it back. Delete it in that calendar to remove it for good."
              : "This can't be undone."
          }
          confirmLabel="Delete"
          confirmDanger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </ModalOverlay>
  );
}
