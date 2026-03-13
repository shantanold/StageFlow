import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobs } from "../lib/queries";
import { formatDate, jobStatusBadgeClass } from "../lib/utils";
import type { Job } from "../types";

type Tab = "active" | "completed";

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function Jobs() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("active");
  const { data: jobs = [], isLoading } = useJobs();

  const filtered =
    tab === "active"
      ? jobs.filter((j) => j.status === "planning" || j.status === "active")
      : jobs.filter((j) => j.status === "completed" || j.status === "cancelled");

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">{jobs.length} total</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: "8px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
          onClick={() => navigate("/jobs/new")}
        >
          <PlusIcon /> New job
        </button>
      </div>

      <div style={{ padding: "0 18px" }}>
        <div className="chip-row" style={{ marginBottom: 14 }}>
          <button
            className={`chip ${tab === "active" ? "active" : ""}`}
            onClick={() => setTab("active")}
          >
            Active
          </button>
          <button
            className={`chip ${tab === "completed" ? "active" : ""}`}
            onClick={() => setTab("completed")}
          >
            Completed
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            No {tab} jobs
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 24 }}>
            {filtered.map((job: Job) => (
              <div
                key={job.id}
                className="card"
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/jobs/${job.id}`)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{job.address}</div>
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {job.city}, {job.state} · {job.client_name}
                    </div>
                  </div>
                  <span className={jobStatusBadgeClass(job.status)} style={{ flexShrink: 0, textTransform: "capitalize" }}>
                    {job.status}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                  <span>{job.item_count} items</span>
                  <span>
                    {formatDate(job.start_date)} — {formatDate(job.expected_end_date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
