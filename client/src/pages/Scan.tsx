import { useNavigate } from "react-router-dom";
import { useJobs } from "../lib/queries";
import { formatDate } from "../lib/utils";

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function ScanOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function ScanReturnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

export function Scan() {
  const navigate = useNavigate();
  const { data: allJobs = [] } = useJobs();
  const activeJobs = allJobs.filter((j) => j.status === "active" || j.status === "planning");

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Scan</h1>
        <p className="page-subtitle">Quick scan or job scan</p>
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Quick Scan card */}
        <div
          className="card"
          style={{ marginBottom: 20, cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
          onClick={() => navigate("/scan/quick")}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: 10, flexShrink: 0,
              background: "var(--accent)", opacity: 0.9,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff",
            }}
          >
            <CameraIcon />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Quick Scan</p>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Scan any QR to look up an item
            </p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        {/* Active jobs */}
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.6px" }}>
          Active jobs
        </div>

        {activeJobs.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No active jobs</p>
          </div>
        ) : (
          <div className="list-card">
            {activeJobs.map((job) => (
              <div key={job.id} className="list-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: "100%" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{job.address}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {job.client_name} · {job.item_count} items · closes {formatDate(job.expected_end_date)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  <button
                    className="btn btn-outline"
                    style={{ flex: 1, fontSize: 12, gap: 5, padding: "7px 12px" }}
                    onClick={() => navigate(`/scan/out/${job.id}`)}
                  >
                    <ScanOutIcon /> Load Items
                  </button>
                  {job.status === "active" && (
                    <button
                      className="btn btn-outline"
                      style={{ flex: 1, fontSize: 12, gap: 5, padding: "7px 12px" }}
                      onClick={() => navigate(`/scan/return/${job.id}`)}
                    >
                      <ScanReturnIcon /> Scan Return
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
