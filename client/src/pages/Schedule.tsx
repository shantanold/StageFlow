import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCalendarEvents, useJobs } from "../lib/queries";
import { useAuth } from "../contexts/AuthContext";
import {
  addLocalDays, buildSchedule, dateFromKey, dayKey, eventTimeLabel, sourceLabel, startOfLocalDay, startOfWeek,
  type ScheduleEntry,
} from "../lib/schedule";
import { EventModal } from "./schedule/EventModal";
import { ImportModal } from "./schedule/ImportModal";
import type { CalendarEvent } from "../types";

type View = "week" | "agenda";

const AGENDA_DAYS = 30;

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
    </svg>
  );
}

const weekdayShort = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

function weekLabel(start: Date) {
  const end = addLocalDays(start, 6);
  const sameYear = start.getFullYear() === new Date().getFullYear() && end.getFullYear() === start.getFullYear();
  return `${monthDay.format(start)} – ${monthDay.format(end)}${sameYear ? "" : `, ${end.getFullYear()}`}`;
}

function dayHeading(key: string, today: string) {
  const d = dateFromKey(key);
  if (key === today) return `Today · ${longDay.format(d)}`;
  if (key === dayKey(addLocalDays(dateFromKey(today), 1))) return `Tomorrow · ${longDay.format(d)}`;
  return longDay.format(d);
}

function EntryRow({ entry, day, onOpen }: { entry: ScheduleEntry; day: string; onOpen: (ev: CalendarEvent) => void }) {
  const navigate = useNavigate();

  if (entry.kind === "job") {
    const { job, milestone } = entry;
    return (
      <div className="list-row" onClick={() => navigate(`/jobs/${job.id}`)}>
        <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: milestone === "install" ? "var(--green)" : "var(--amber)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.address}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
            {milestone === "install" ? "Job starts" : job.actual_end_date ? "Job closed" : "Job ends"} · {job.client_name}
          </div>
        </div>
        <span className={`badge ${milestone === "install" ? "badge-green" : "badge-amber"}`} style={{ flexShrink: 0 }}>
          {milestone === "install" ? "Install" : "Pickup"}
        </span>
      </div>
    );
  }

  const ev = entry.event;
  const from = sourceLabel(ev);
  return (
    <div className="list-row" onClick={() => onOpen(ev)} style={{ alignItems: "flex-start" }}>
      <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, background: ev.is_busy ? "var(--accent)" : "var(--text-tertiary)", opacity: ev.is_busy ? 1 : 0.5, flexShrink: 0 }} />
      <div style={{ width: 64, flexShrink: 0, fontSize: 12, color: "var(--text-secondary)", paddingTop: 1, fontVariantNumeric: "tabular-nums", lineHeight: 1.45 }}>
        {eventTimeLabel(ev, day).split(" – ").map((part, i) => (
          <div key={i} style={i > 0 ? { color: "var(--text-tertiary)" } : undefined}>{part}</div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ev.title}
        </div>
        {(ev.location || ev.assignee || ev.job) && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[ev.location, ev.job && !ev.location ? ev.job.address : null, ev.assignee?.name].filter(Boolean).join(" · ")}
          </div>
        )}
        {(from || !ev.is_busy) && (
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {from && <span className="badge badge-gray">{from}</span>}
            {!ev.is_busy && <span className="badge badge-gray">Free</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function DayList({ entries, day, onOpen, emptyText }: {
  entries: ScheduleEntry[] | undefined; day: string; onOpen: (ev: CalendarEvent) => void; emptyText?: string;
}) {
  if (!entries?.length) {
    return emptyText ? (
      <div style={{ padding: "28px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>{emptyText}</div>
    ) : null;
  }
  return (
    <div className="list-card">
      {entries.map((e) => <EntryRow key={e.key} entry={e} day={day} onOpen={onOpen} />)}
    </div>
  );
}

export function Schedule() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const today = dayKey(new Date());

  const [view, setView] = useState<View>("week");
  const [selected, setSelected] = useState(today);
  const [agendaDays, setAgendaDays] = useState(AGENDA_DAYS);
  const [editing, setEditing] = useState<{ event?: CalendarEvent; day: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const weekStart = startOfWeek(dateFromKey(selected));
  const [from, to] =
    view === "week"
      ? [weekStart, addLocalDays(weekStart, 7)]
      : [startOfLocalDay(new Date()), addLocalDays(startOfLocalDay(new Date()), agendaDays)];

  const { data: events = [], isLoading, isError, refetch } = useCalendarEvents(from, to);
  const { data: jobs = [] } = useJobs();
  const schedule = useMemo(() => buildSchedule(events, jobs), [events, jobs]);

  const weekDays = Array.from({ length: 7 }, (_, i) => dayKey(addLocalDays(weekStart, i)));
  const agendaKeys = Array.from({ length: agendaDays }, (_, i) => dayKey(addLocalDays(from, i)))
    .filter((k) => schedule.get(k)?.length);

  const openEvent = (ev: CalendarEvent) => setEditing({ event: ev, day: selected });

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="page-subtitle">Appointments, installs and pickups</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {isManager && (
            <button className="btn btn-outline" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => setImporting(true)}>
              Import
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ padding: "8px 14px", fontSize: 12 }}
            onClick={() => setEditing({ day: view === "week" ? selected : today })}
          >
            <PlusIcon /> New
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="chip-row">
          <button className={`chip ${view === "week" ? "active" : ""}`} onClick={() => setView("week")}>Week</button>
          <button className={`chip ${view === "agenda" ? "active" : ""}`} onClick={() => setView("agenda")}>Agenda</button>
        </div>

        {isError && (
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "var(--red-text)" }}>Couldn't load the schedule</span>
            <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => refetch()}>Retry</button>
          </div>
        )}

        {view === "week" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <button className="btn btn-outline" style={{ padding: "6px 8px" }} aria-label="Previous week"
                onClick={() => setSelected(dayKey(addLocalDays(dateFromKey(selected), -7)))}>
                <Chevron dir="left" />
              </button>
              <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 500 }}>{weekLabel(weekStart)}</div>
              <button className="btn btn-outline" style={{ padding: "6px 8px" }} aria-label="Next week"
                onClick={() => setSelected(dayKey(addLocalDays(dateFromKey(selected), 7)))}>
                <Chevron dir="right" />
              </button>
              <button className="btn btn-outline" style={{ padding: "6px 10px", fontSize: 12 }} disabled={selected === today}
                onClick={() => setSelected(today)}>
                Today
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 16 }}>
              {weekDays.map((k) => {
                const d = dateFromKey(k);
                const count = schedule.get(k)?.length ?? 0;
                const isSel = k === selected;
                return (
                  <button
                    key={k}
                    onClick={() => setSelected(k)}
                    aria-pressed={isSel}
                    aria-label={`${longDay.format(d)}, ${count} ${count === 1 ? "entry" : "entries"}`}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      padding: "8px 0 7px", borderRadius: "var(--radius-md)", cursor: "pointer",
                      fontFamily: "inherit",
                      border: `1px solid ${isSel ? "var(--accent)" : "var(--border)"}`,
                      background: isSel ? "var(--accent)" : "var(--bg-card)",
                      color: isSel ? "white" : "var(--text-primary)",
                    }}
                  >
                    <span style={{ fontSize: 10.5, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {weekdayShort.format(d).slice(0, 2)}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: k === today || isSel ? 700 : 500, color: !isSel && k === today ? "var(--accent)" : undefined }}>
                      {d.getDate()}
                    </span>
                    <span style={{ display: "flex", gap: 2, height: 5 }}>
                      {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                        <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? "white" : "var(--accent)", opacity: 0.85 }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="section-title" style={{ marginBottom: 8 }}>{dayHeading(selected, today)}</p>
            {isLoading ? (
              <div style={{ padding: "28px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div>
            ) : (
              <DayList entries={schedule.get(selected)} day={selected} onOpen={openEvent} emptyText="Nothing scheduled" />
            )}
          </>
        ) : isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {agendaKeys.length === 0 && (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                Nothing scheduled in the next {agendaDays} days
              </div>
            )}
            {agendaKeys.map((k) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <p className="section-title" style={{ fontSize: 13.5, marginBottom: 6, color: k === today ? "var(--accent)" : undefined }}>
                  {dayHeading(k, today)}
                </p>
                <DayList entries={schedule.get(k)} day={k} onOpen={(ev) => setEditing({ event: ev, day: k })} />
              </div>
            ))}
            {agendaDays < 365 && (
              <button className="btn btn-outline btn-full" style={{ marginBottom: 20 }} onClick={() => setAgendaDays((d) => d + AGENDA_DAYS)}>
                Show the next {AGENDA_DAYS} days
              </button>
            )}
          </>
        )}
      </div>

      {editing && <EventModal event={editing.event} day={editing.day} onClose={() => setEditing(null)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}
