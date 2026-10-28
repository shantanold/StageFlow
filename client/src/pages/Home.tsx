import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard, useItems } from "../lib/queries";
import { formatCalendarDayShort, unpricedItems } from "../lib/utils";
import type { Job } from "../types";
import { AdminHome } from "./admin/AdminHome";

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
      onClick: () => navigate("/inventory?filter=available"),
    },
    {
      label:  "Staged",
      value:  stats?.staged_count ?? "—",
      sub:    stats ? `across ${stats.active_jobs_count} house${stats.active_jobs_count !== 1 ? "s" : ""}` : "",
      color:  "#60a5fa",
      onClick: () => navigate("/inventory?filter=staged"),
    },
    {
      label:  "Active jobs",
      value:  stats?.active_jobs_count ?? "—",
      sub:    stats ? `${stats.upcoming_jobs.length} with dates` : "",
      color:  "var(--text-primary)",
      onClick: () => navigate("/jobs"),
    },
    {
      label:  "Needs attention",
      value:  stats?.needs_attention ?? "—",
      sub:    "damaged or missing",
      color:  "var(--amber-text)",
      onClick: () => navigate("/inventory?filter=flagged"),
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header" style={{ paddingTop: "calc(20px + var(--safe-top))" }}>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 2 }}>{greeting()},</p>
        <h1 className="page-title">{user?.name}</h1>
      </div>

      <div className="page-body">
        {/* Stat cards */}
        <div className="stat-grid">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="card"
              style={{ cursor: "pointer", padding: 14 }}
              onClick={card.onClick}
            >
              <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                {card.label}
              </p>
              <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: card.color, marginBottom: 2 }}>
                {isLoading ? (
                  <span style={{ display: "inline-block", width: 36, height: 28, background: "var(--bg-surface)", borderRadius: 4, verticalAlign: "middle" }} />
                ) : card.value}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{card.sub}</p>
            </div>
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
            <span className="price-prompt-go" aria-hidden>→</span>
          </button>
        )}

        {/* Major pieces */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 10 }}>
            <span className="section-title">Major pieces</span>
          </div>
          {isLoading ? (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ height: 14, width: "40%", background: "var(--bg-surface)", borderRadius: 4, marginBottom: 10 }} />
              <div style={{ height: 14, width: "55%", background: "var(--bg-surface)", borderRadius: 4 }} />
            </div>
          ) : (
            <div className="list-card">
              {(stats?.major_pieces ?? []).map((piece) => {
                const low = piece.available < LOW_STOCK_THRESHOLD;
                return (
                  <div key={piece.key} className="list-row" style={{ cursor: "default" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: low ? "var(--red-text)" : "var(--text-primary)",
                        }}
                      >
                        {piece.label}
                      </p>
                      <p
                        style={{
                          fontSize: 11.5,
                          marginTop: 2,
                          color: low ? "var(--red-text)" : "var(--text-tertiary)",
                        }}
                      >
                        {piece.available} unstaged · {piece.staged} staged
                        {low ? " · low stock" : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming returns */}
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
        >
          <span className="section-title">Upcoming returns</span>
          <button className="back-btn" style={{ marginBottom: 0 }} onClick={() => navigate("/jobs")}>
            View all
          </button>
        </div>

        {isLoading ? (
          <UpcomingReturnsSkeleton />
        ) : !stats || stats.upcoming_jobs.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "28px 16px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No active jobs</p>
          </div>
        ) : (
          <div className="list-card" style={{ marginBottom: 24 }}>
            {stats.upcoming_jobs.map((job) => (
              <UpcomingJobRow key={job.id} job={job} onClick={() => navigate(`/jobs/${job.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DollarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function UpcomingJobRow({ job, onClick }: { job: Job; onClick: () => void }) {
  const closeDate    = new Date(job.expected_end_date);
  const sevenDaysOut = new Date(Date.now() + 7 * 86_400_000);
  const urgent       = closeDate <= sevenDaysOut;

  return (
    <div className="list-row" style={{ cursor: "pointer" }} onClick={onClick}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {job.address}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
          {job.item_count} item{job.item_count !== 1 ? "s" : ""} · {job.client_name}
        </p>
      </div>
      <span className={`badge ${urgent ? "badge-amber" : "badge-blue"}`}>
        {formatCalendarDayShort(job.expected_end_date)}
      </span>
    </div>
  );
}

function UpcomingReturnsSkeleton() {
  return (
    <div className="list-card">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="list-row" style={{ pointerEvents: "none" }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, width: "60%", background: "var(--bg-surface)", borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 10, width: "35%", background: "var(--bg-surface)", borderRadius: 3 }} />
          </div>
          <div style={{ width: 48, height: 20, background: "var(--bg-surface)", borderRadius: 10 }} />
        </div>
      ))}
    </div>
  );
}
