import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useJob, useJobItems } from "../../lib/queries";
import { getCategoryEmoji, jobStatusBadgeClass, statusBadgeClass, statusLabel } from "../../lib/utils";
import { formatDate } from "../../lib/utils";
import type { JobItemRow } from "../../types";
import { EditJobModal } from "./EditJobModal";
import { AssignItemsModal } from "./AssignItemsModal";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// Group job items by set: { setId: string | null, setName: string, items: JobItemRow[] }
function groupBySet(rows: JobItemRow[]): { setId: string | null; setName: string; items: JobItemRow[] }[] {
  const map = new Map<string | null, JobItemRow[]>();
  const setNames = new Map<string | null, string>();
  setNames.set(null, "Standalone");

  for (const row of rows) {
    const setId = row.item.set?.id ?? null;
    const setName = row.item.set?.name ?? "Standalone";
    if (!map.has(setId)) {
      map.set(setId, []);
      setNames.set(setId, setName);
    }
    map.get(setId)!.push(row);
  }

  return Array.from(map.entries()).map(([setId, items]) => ({
    setId,
    setName: setNames.get(setId) ?? "Standalone",
    items,
  }));
}

export function JobDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const { data: job, isLoading: jobLoading } = useJob(id);
  const { data: jobItems = [], isLoading: itemsLoading } = useJobItems(id);

  if (jobLoading) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--red-text)", fontSize: 13 }}>Job not found.</p>
      </div>
    );
  }

  const groups = groupBySet(jobItems);

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/jobs")} style={{ marginBottom: 8 }}>
          <BackIcon /> Jobs
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 18 }}>{job.address}</h1>
            <p className="page-subtitle">{job.city}, {job.state} {job.zip}</p>
          </div>
          <span className={jobStatusBadgeClass(job.status)} style={{ textTransform: "capitalize" }}>
            {job.status}
          </span>
        </div>
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Stat cards */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Client</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{job.client_name}</div>
        </div>
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Contact</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{job.client_contact}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div className="card">
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Start date</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(job.start_date)}</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Expected close</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--amber-text)" }}>{formatDate(job.expected_end_date)}</div>
          </div>
        </div>
        {job.notes && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 13 }}>{job.notes}</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {(job.status === "active" || job.status === "planning") && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowAssign(true)}>
              Assign items
            </button>
          )}
          {job.status === "active" && (
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => navigate(`/scan/return/${id}`)}>
              Scan return
            </button>
          )}
          <button className="btn btn-outline" onClick={() => setShowEdit(true)}>
            Edit job
          </button>
        </div>

        {/* Items on this job */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span className="section-title">Items on this job</span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{jobItems.length} pieces</span>
        </div>

        {itemsLoading ? (
          <div className="list-card">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="list-row" style={{ pointerEvents: "none" }}>
                <div style={{ width: 42, height: 42, borderRadius: 6, background: "var(--bg-surface)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, width: "55%", background: "var(--bg-surface)", borderRadius: 4, marginBottom: 6 }} />
                  <div style={{ height: 10, width: "30%", background: "var(--bg-surface)", borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        ) : jobItems.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No items assigned yet. Tap “Assign items” to add inventory.</p>
          </div>
        ) : (
          <div style={{ paddingBottom: 24 }}>
            {groups.map(({ setName, items }) => (
              <div key={setName} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>
                  {items.length} item{items.length !== 1 ? "s" : ""} from {setName}
                </div>
                <div className="list-card">
                  {items.map((row) => (
                    <div
                      key={row.id}
                      className="list-row"
                      onClick={() => navigate(`/inventory/${row.item.id}`)}
                    >
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 6,
                          background: "var(--bg-surface)",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                        }}
                      >
                        {getCategoryEmoji(row.item.category)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.item.name}
                        </p>
                        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                          {row.item.sku} · {row.item.category}
                        </p>
                      </div>
                      <span className={statusBadgeClass(row.item.status, row.item.condition)}>
                        {statusLabel(row.item.status, row.item.condition)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && <EditJobModal job={job} onClose={() => setShowEdit(false)} />}
      {showAssign && <AssignItemsModal jobId={id} onClose={() => setShowAssign(false)} />}
    </div>
  );
}
