import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard, useItems } from "../lib/queries";
import { formatCalendarDayShort, unpricedItems } from "../lib/utils";
import type { Job } from "../types";
import { AdminHome } from "./admin/AdminHome";
import { BandWatermark, Icon, StatusPill } from "../components/b2";
import { dateTile, localDay, todayLine } from "../lib/b2";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const LOW_STOCK_THRESHOLD = 5;

export function Home() {
  const { user, isAdminMode } = useAuth();
  const navigate  = useNavigate();
  const { data: stats, isLoading } = useDashboard();
  const canPrice = user?.role === "manager" && !isAdminMode;
  const { data: catalog } = useItems({}, { enabled: canPrice });
  const unpricedCount = unpricedItems(catalog ?? []).length;

  // Platform admins sit in a furniture-free org, so their own dashboard would be
  // all zeros; they get a cross-org landing page instead.
  if (isAdminMode && user) {
    return <AdminHome greeting={greeting()} name={user.name} />;
  }

  const statCards = [
    {
      label:  "Unstaged",
      value:  stats?.available_count ?? "—",
      sub:    stats ? `of ${stats.total_items} total` : "",
      color:  "var(--green-text)",
      to:     "/inventory?filter=available",
    },
    {
      label:  "Staged",
      value:  stats?.staged_count ?? "—",
      sub:    stats ? `across ${stats.active_jobs_count} house${stats.active_jobs_count !== 1 ? "s" : ""}` : "",
      color:  "var(--teal-text)",
      to:     "/inventory?filter=staged",
    },
    {
      label:  "Active jobs",
      value:  stats?.active_jobs_count ?? "—",
      sub:    stats ? `${stats.upcoming_jobs.length} with dates` : "",
      color:  "var(--ink)",
      to:     "/jobs",
    },
    {
      label:  "Needs attention",
      value:  stats?.needs_attention ?? "—",
      sub:    "damaged or missing",
      color:  stats && stats.needs_attention > 0 ? "var(--red-text)" : "var(--ink)",
      to:     "/inventory?filter=flagged",
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <BandWatermark kind="logo" />
        <p className="band-kicker">{todayLine()}</p>
        <h1 className="page-title" style={{ marginTop: 6 }}>
          {greeting()}, {firstName(user?.name)}
        </h1>
        {stats && (
          <p className="page-subtitle">{Math.round(stats.utilization_pct)}% of inventory in use</p>
        )}
      </div>

      <div className="page-body">
        <div className="stat-grid">
          {statCards.map((card) => (
            <button key={card.label} type="button" className="card stat-card" onClick={() => navigate(card.to)}>
              <span className="stat-label">{card.label}</span>
              <span className="stat-value" style={{ color: card.color }}>
                {isLoading ? <span className="skeleton" style={{ display: "inline-block", width: 40, height: 30 }} /> : card.value}
              </span>
              <span className="stat-sub">{card.sub}</span>
            </button>
          ))}
        </div>

        {canPrice && unpricedCount > 0 && (
          <button type="button" className="price-prompt" onClick={() => navigate("/price")}>
            <span className="price-prompt-icon" aria-hidden>
              <DollarIcon />
            </span>
            <span className="price-prompt-copy">
              <span className="price-prompt-title">Price items</span>
              <span className="price-prompt-sub">
                {unpricedCount} item{unpricedCount === 1 ? "" : "s"} still at $0
              </span>
            </span>
            <Icon.Chevron className="chevron" />
          </button>
        )}

        <div className="home-columns">
          {/* Upcoming returns */}
          <section aria-labelledby="upcoming-returns" style={{ marginBottom: 20 }}>
            <div className="section-head">
              <h2 id="upcoming-returns" className="section-title">Upcoming returns</h2>
              <Link to="/jobs">View all</Link>
            </div>
            {isLoading ? (
              <div className="list-card"><UpcomingReturnsSkeleton /></div>
            ) : !stats || stats.upcoming_jobs.length === 0 ? (
              <div className="card empty-state">No active jobs</div>
            ) : (
              <div className="list-card">
                {stats.upcoming_jobs.map((job) => (
                  <UpcomingJobRow key={job.id} job={job} />
                ))}
              </div>
            )}
          </section>

          {/* Major pieces */}
          <section aria-labelledby="major-pieces" style={{ marginBottom: 20 }}>
            <div className="section-head">
              <h2 id="major-pieces" className="section-title">Major pieces</h2>
              <Link to="/inventory">Inventory</Link>
            </div>
            {isLoading ? (
              <div className="list-card"><UpcomingReturnsSkeleton /></div>
            ) : (
              <div className="list-card">
                {(stats?.major_pieces ?? []).map((piece) => {
                  const low = piece.available < LOW_STOCK_THRESHOLD;
                  return (
                    <div key={piece.key} className="list-row" style={{ cursor: "default" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 600 }}>{piece.label}</p>
                        <p style={{ fontSize: 13, marginTop: 1, color: "var(--ink-secondary)" }}>
                          {piece.available} unstaged · {piece.staged} staged
                        </p>
                      </div>
                      {low && <StatusPill tone="red" glyph="alert">Low stock</StatusPill>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

function DollarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function UpcomingJobRow({ job }: { job: Job }) {
  const tile = dateTile(localDay(job.expected_end_date));
  return (
    <Link to={`/jobs/${job.id}`} className="list-row" style={{ gap: 14 }}>
      <span className={`date-tile${tile.isToday ? " is-today" : ""}`} aria-hidden>
        <span className="date-tile-top">{tile.top}</span>
        <span className="date-tile-day">{tile.number}</span>
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {job.address}
        </span>
        <span style={{ fontSize: 13, color: "var(--ink-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {formatCalendarDayShort(job.expected_end_date)} · {job.item_count} item{job.item_count !== 1 ? "s" : ""} · {job.client_name}
        </span>
      </span>
      <Icon.Chevron className="chevron" />
    </Link>
  );
}

function UpcomingReturnsSkeleton() {
  return (
    <div aria-hidden>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="list-row" style={{ pointerEvents: "none", gap: 14 }}>
          <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 12 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 13, width: "60%", marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 10, width: "35%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
