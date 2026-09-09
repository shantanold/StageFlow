import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useJob, useJobItems, useForceCompleteJob, useUnassignItems, useMarkLoaded, useUndoLoad, useMarkReturned } from "../../lib/queries";
import { getCategoryEmoji, jobStatusBadgeClass, statusBadgeClass, statusLabel, jobItemStatusLabel } from "../../lib/utils";
import { formatDate } from "../../lib/utils";
import { displayPhotoUrl } from "../../lib/cloudinary";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ModalOverlay } from "../../components/ModalOverlay";
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

function RemoveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const isManager = user?.role === "manager";
  const [showEdit, setShowEdit] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showForceComplete, setShowForceComplete] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<JobItemRow | null>(null);

  const { data: job, isLoading: jobLoading } = useJob(id);
  const { data: jobItems = [], isLoading: itemsLoading } = useJobItems(id);
  const forceComplete = useForceCompleteJob(id);
  const unassignItems = useUnassignItems(id);
  const markLoaded = useMarkLoaded(id);
  const undoLoad = useUndoLoad(id);
  const markReturned = useMarkReturned(id);
  const [returnTarget, setReturnTarget] = useState<JobItemRow | null>(null);

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
  const unreturnedCount = jobItems.filter((ji) => ji.status !== "returned").length;
  const canEditItems = isManager && (job.status === "active" || job.status === "planning");

  async function handleForceComplete() {
    try {
      const result = await forceComplete.mutateAsync();
      showToast(`Job closed — ${result.missing_count} item(s) marked missing`, "success");
      setShowForceComplete(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to force-complete job", "error");
    }
  }

  async function handleUnassign() {
    if (!unassignTarget) return;
    try {
      await unassignItems.mutateAsync([unassignTarget.item_id]);
      showToast(`Removed “${unassignTarget.item.name}” from this job`, "success");
      setUnassignTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to unassign item", "error");
    }
  }

  async function handleMarkLoaded(row: JobItemRow) {
    try {
      await markLoaded.mutateAsync(row.item_id);
      showToast(`Marked “${row.item.name}” staged`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to mark staged", "error");
    }
  }

  async function handleUndoLoad(row: JobItemRow) {
    try {
      await undoLoad.mutateAsync(row.item_id);
      showToast(`Marked “${row.item.name}” unstaged`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to mark unstaged", "error");
    }
  }

  async function handleMarkReturned(condition: "good" | "damaged" | "dispose") {
    if (!returnTarget) return;
    try {
      const result = await markReturned.mutateAsync({
        itemId: returnTarget.item_id,
        condition,
      });
      showToast(
        result.job_completed
          ? `Returned — job completed`
          : `Marked “${returnTarget.item.name}” returned`,
        "success",
      );
      setReturnTarget(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to mark returned", "error");
    }
  }

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

      <div className="page-body">
        {/* Stat cards */}
        <div className="pair-grid" style={{ marginBottom: 14, maxWidth: "none" }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Client</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{job.client_name}</div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Contact</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{job.client_contact}</div>
          </div>
        </div>
        <div className="pair-grid" style={{ marginBottom: 14, maxWidth: "none" }}>
          <div className="card">
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Start date</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(job.start_date)}</div>
          </div>
          {job.actual_end_date ? (
            <div className="card" style={{ borderColor: "rgba(16,185,129,0.3)" }}>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Closed</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--green-text)" }}>{formatDate(job.actual_end_date)}</div>
            </div>
          ) : (
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Expected close</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--amber-text)" }}>{formatDate(job.expected_end_date)}</div>
            </div>
          )}
        </div>
        {job.notes && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 13 }}>{job.notes}</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {canEditItems && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowAssign(true)}>
              Assign items
            </button>
          )}
          {job.status === "active" && (
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => navigate(`/scan/return/${id}`)}>
              Scan return
            </button>
          )}
          {isManager && (
            <button className="btn btn-outline" onClick={() => setShowEdit(true)}>
              Edit job
            </button>
          )}
        </div>

        {canEditItems && unreturnedCount > 0 && (
          <button
            className="btn btn-outline"
            style={{
              width: "100%",
              fontSize: 12.5,
              borderColor: "rgba(239,68,68,0.4)",
              color: "var(--red-text)",
              marginBottom: 18,
            }}
            onClick={() => setShowForceComplete(true)}
          >
            Force complete — mark {unreturnedCount} unreturned item{unreturnedCount === 1 ? "" : "s"} missing
          </button>
        )}

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
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              {isManager ? "No items assigned yet. Tap “Assign items” to add inventory." : "No items assigned yet."}
            </p>
          </div>
        ) : (
          <div style={{ paddingBottom: 24 }}>
            {groups.map(({ setName, items }) => (
              <div key={setName} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>
                  {items.length} item{items.length !== 1 ? "s" : ""} from {setName}
                </div>
                <div className="list-card">
                  {items.map((row) => {
                    const canUnassign = canEditItems && (row.status === "assigned" || row.status === "loaded" || row.status === "staged");
                    const canMarkLoaded = canEditItems && row.status === "assigned";
                    const canUndoLoad = canEditItems && ["loaded", "delivered", "picked_up"].includes(row.status);
                    const canMarkReturned = canEditItems && row.status !== "returned";
                    return (
                      <div
                        key={row.id}
                        className="list-row"
                        style={{ flexWrap: "wrap", gap: 8 }}
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
                            overflow: "hidden",
                          }}
                        >
                          {displayPhotoUrl(row.item.photo_url) ? (
                            <img
                              src={displayPhotoUrl(row.item.photo_url)}
                              alt={row.item.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            getCategoryEmoji(row.item.category)
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {row.item.name}
                          </p>
                          <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                            {row.item.sku} · {jobItemStatusLabel(row.status)}
                          </p>
                        </div>
                        <span className={statusBadgeClass(row.item.status, row.item.condition)}>
                          {statusLabel(row.item.status, row.item.condition)}
                        </span>
                        {canUnassign && (
                          <button
                            className="btn btn-outline"
                            title="Remove from job"
                            aria-label={`Remove ${row.item.name} from job`}
                            style={{
                              padding: 7,
                              flexShrink: 0,
                              borderColor: "rgba(239,68,68,0.35)",
                              color: "var(--red-text)",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setUnassignTarget(row);
                            }}
                          >
                            <RemoveIcon />
                          </button>
                        )}
                        {(canMarkLoaded || canUndoLoad || canMarkReturned) && (
                          <div style={{ width: "100%", display: "flex", gap: 6, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                            {canMarkLoaded && (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: "5px 10px" }} disabled={markLoaded.isPending} onClick={() => handleMarkLoaded(row)}>
                                Mark staged
                              </button>
                            )}
                            {canUndoLoad && (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: "5px 10px" }} disabled={undoLoad.isPending} onClick={() => handleUndoLoad(row)}>
                                Mark unstaged
                              </button>
                            )}
                            {canMarkReturned && (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setReturnTarget(row)}>
                                Mark returned
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && <EditJobModal job={job} onClose={() => setShowEdit(false)} />}
      {showAssign && <AssignItemsModal jobId={id} onClose={() => setShowAssign(false)} />}
      {showForceComplete && (
        <ConfirmDialog
          title="Force complete this job?"
          message={`${unreturnedCount} item${unreturnedCount === 1 ? "" : "s"} on this job haven't been returned. They'll be marked missing and flagged in inventory — you can mark one "found" later if it turns up. This closes the job now. Only do this if you're sure these items aren't coming back.`}
          confirmLabel={forceComplete.isPending ? "Closing…" : "Force complete"}
          confirmDanger
          onConfirm={handleForceComplete}
          onCancel={() => setShowForceComplete(false)}
        />
      )}
      {unassignTarget && (
        <ConfirmDialog
          title="Remove from this job?"
          message={`“${unassignTarget.item.name}” will be removed from this job and marked unstaged.`}
          confirmLabel={unassignItems.isPending ? "Removing…" : "Remove"}
          confirmDanger
          onConfirm={handleUnassign}
          onCancel={() => setUnassignTarget(null)}
        />
      )}
      {returnTarget && (
        <ModalOverlay onClose={() => setReturnTarget(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ padding: 18 }}>
            <div className="modal-handle" />
            <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Mark returned</p>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 14 }}>
              {returnTarget.item.name} — condition?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(["good", "damaged", "dispose"] as const).map((c) => (
                <button
                  key={c}
                  className="btn btn-outline"
                  style={{ width: "100%", textTransform: "capitalize" }}
                  disabled={markReturned.isPending}
                  onClick={() => handleMarkReturned(c)}
                >
                  {c}
                </button>
              ))}
              <button className="btn btn-outline" style={{ width: "100%" }} onClick={() => setReturnTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
