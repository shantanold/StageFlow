import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard } from "../lib/queries";
import { formatDateShort } from "../lib/utils";
import type { Job } from "../types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function Home() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const { data: stats, isLoading } = useDashboard();

  const statCards = [
    {
      label:  "Available",
      value:  stats?.available_count ?? "—",
      sub:    stats ? `of ${stats.total_items} total` : "",
      color:  "var(--green-text)",
      onClick: () => navigate("/inventory?filter=available"),
    },
    {
      label:  "Staged out",
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
      sub:    "damaged items",
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

      <div style={{ padding: "0 18px" }}>
        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
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
        {formatDateShort(job.expected_end_date)}
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
