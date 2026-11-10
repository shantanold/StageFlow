import { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useItem, useItemMovements, useUpdateItem, useMarkItemFound,
  useDisposeItem, useDeleteItem, useDuplicateItem, useSetItemStatus, useJobs,
  useAssignToJob, useSets, useCreateSet,
} from "../../lib/queries";
import { downloadLabels, useQRCodeUrl } from "../../lib/labels";
import { displayPhotoUrl, uploadImage } from "../../lib/cloudinary";
import {
  getCategoryEmoji, statusLabel,
  formatDate, formatCalendarDay, formatCurrency, formatDimensions, movementDotColor, CATEGORIES,
} from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api";
import { ModalOverlay } from "../../components/ModalOverlay";
import { BandBack, ConditionPill, Icon, ItemStatusPill } from "../../components/b2";
import type { ItemDetail as ItemDetailType, Movement } from "../../types";

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function QRSection({
  itemId,
  qrPrinted,
  canEdit,
}: {
  itemId: string;
  qrPrinted: boolean;
  canEdit: boolean;
}) {
  const { src, loading } = useQRCodeUrl(itemId);
  const [printing, setPrinting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const queryClient = useQueryClient();
  const updateItem = useUpdateItem(itemId);
  const { showToast } = useToast();

  async function handlePrint() {
    setPrinting(true);
    try {
      await downloadLabels([itemId]);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    } finally {
      setPrinting(false);
    }
  }

  async function handleTogglePrinted() {
    if (!canEdit || toggling) return;
    setToggling(true);
    try {
      await updateItem.mutateAsync({ qr_printed: !qrPrinted });
      showToast(qrPrinted ? "Marked as not printed" : "Marked as printed", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update", "error");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        display: "flex", alignItems: "center", gap: 16,
      }}
    >
      {/* QR image */}
      <div
        style={{
          width: 84, height: 84, flexShrink: 0,
          background: "white", borderRadius: 14, padding: 6, border: "1px solid var(--hairline)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {loading ? (
          <div style={{ width: 16, height: 16, border: "2px solid #e5e7eb", borderTopColor: "var(--brand)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        ) : src ? (
          <img src={src} alt="QR code" style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
        ) : (
          <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Error</span>
        )}
      </div>

      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <p className="card-title" style={{ margin: 0 }}>QR label</p>
          <span className={`badge ${qrPrinted ? "badge-green" : "badge-gray"}`}>
            {qrPrinted ? "Printed" : "Not printed"}
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
          Scan to look up this item
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            className="btn btn-soft"
            style={{ minHeight: 36, padding: "6px 12px", fontSize: 13, gap: 5 }}
            onClick={handlePrint}
            disabled={printing || loading}
          >
            <PrinterIcon /> {printing ? "Generating…" : "Print label"}
          </button>
          {canEdit && (
            <button
              className="btn btn-outline"
              style={{ minHeight: 36, padding: "6px 12px", fontSize: 13 }}
              onClick={handleTogglePrinted}
              disabled={toggling}
            >
              {toggling ? "Saving…" : qrPrinted ? "Mark not printed" : "Mark printed"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ItemDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isManager = user?.role === "manager";
  const [showEdit, setShowEdit] = useState(false);

  const { data: item, isLoading, isError } = useItem(id);
  const { data: movements = [] } = useItemMovements(id);
  const markFound = useMarkItemFound(id);
  const disposeItem = useDisposeItem(id);
  const deleteItem = useDeleteItem(id);
  const duplicateItem = useDuplicateItem();
  const setStatus = useSetItemStatus(id);
  const assignToJob = useAssignToJob();
  const { data: jobs = [] } = useJobs();
  const [confirmAction, setConfirmAction] = useState<"dispose" | "delete" | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [showAssignJob, setShowAssignJob] = useState(false);
  const [assignJobId, setAssignJobId] = useState("");
  const [statusForm, setStatusForm] = useState({ status: "available", condition: "good", notes: "", job_id: "" });

  const activeJobs = jobs.filter((j) => j.status === "planning" || j.status === "active");

  async function handleDuplicate() {
    try {
      const copy = await duplicateItem.mutateAsync(id);
      showToast(`Created copy ${copy.sku}`, "success");
      navigate(`/inventory/${copy.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to duplicate", "error");
    }
  }

  async function handleSetStatus() {
    try {
      await setStatus.mutateAsync({
        status: statusForm.status,
        condition: statusForm.condition,
        notes: statusForm.notes || undefined,
        job_id: statusForm.status === "staged" ? statusForm.job_id || undefined : undefined,
      });
      showToast("Status updated", "success");
      setShowStatus(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to change status", "error");
    }
  }

  async function handleAssignToJob() {
    if (!assignJobId) return;
    try {
      await assignToJob.mutateAsync({ jobId: assignJobId, itemIds: [id] });
      showToast("Assigned to job and marked staged", "success");
      setShowAssignJob(false);
      setAssignJobId("");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to assign item", "error");
    }
  }

  async function handleMarkFound() {
    try {
      await markFound.mutateAsync();
      showToast("Item marked unstaged", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update item", "error");
    }
  }

  async function handleDispose() {
    try {
      await disposeItem.mutateAsync();
      showToast("Item removed from active inventory", "success");
      setConfirmAction(null);
      navigate("/inventory");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to dispose item", "error");
    }
  }

  async function handleDelete() {
    try {
      await deleteItem.mutateAsync();
      showToast("Item permanently deleted", "success");
      setConfirmAction(null);
      navigate("/inventory");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete item", "error");
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--red-text)", fontSize: 13 }}>Item not found.</p>
      </div>
    );
  }

  const canAssignToJob =
    isManager &&
    !item.is_unlabeled &&
    item.name.trim().toLowerCase() !== "red dot home services" &&
    item.status === "available" &&
    !item.current_job;

  return (
    <div className="animate-in">
      {/* Header band */}
      <div className="page-header">
        <div className="band-row" style={{ marginBottom: 18 }}>
          <BandBack label="Back" />
          {isManager && (
            <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={() => setShowEdit(true)}>
              <EditIcon /> Edit
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div className="item-hero-tile">
            {displayPhotoUrl(item.photo_url) ? (
              <img src={displayPhotoUrl(item.photo_url)} alt="" />
            ) : (
              <span aria-hidden style={{ fontSize: 38 }}>{getCategoryEmoji(item.category)}</span>
            )}
          </div>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 className="page-title" style={{ fontSize: 26, overflowWrap: "anywhere" }}>{item.name}</h1>
            <span className="sku" style={{ fontSize: 13, color: "var(--on-band-secondary)" }}>{item.sku}</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ItemStatusPill status={item.status} condition={item.condition} />
              {item.condition !== "damaged" && <ConditionPill condition={item.condition} />}
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="detail-grid">
        <div className="detail-main">
        {canAssignToJob && (
          <button
            type="button"
            className="assign-tile"
            disabled={activeJobs.length === 0}
            onClick={() => {
              setAssignJobId(activeJobs[0]?.id ?? "");
              setShowAssignJob(true);
            }}
          >
            <Icon.Briefcase />
            <span style={{ flex: 1, display: "flex", flexDirection: "column", textAlign: "left" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                {activeJobs.length === 0 ? "No planning or active jobs" : "Assign to a job"}
              </span>
              <span style={{ fontSize: 13, color: "#EAD9FB" }}>It's marked staged once assigned</span>
            </span>
            <Icon.Chevron style={{ width: 16, height: 16 }} />
          </button>
        )}

        {/* Current job card */}
        {item.current_job && (
          <button
            type="button"
            className="list-card list-row"
            style={{ width: "100%", padding: "14px 16px", font: "inherit", textAlign: "left", border: "1px solid var(--hairline)" }}
            onClick={() => navigate(`/jobs/${item.current_job!.id}`)}
          >
            <span className="date-tile" aria-hidden style={{ padding: 0, height: 46, justifyContent: "center", background: "var(--teal-dim)", color: "var(--teal-text)" }}>
              <Icon.Home style={{ width: 22, height: 22 }} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span className="fact-label">Staged at</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{item.current_job.address}</span>
              <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
                {item.current_job.city}, {item.current_job.state} · {item.current_job.client_name}
              </span>
            </span>
            <Icon.Chevron className="chevron" />
          </button>
        )}

        {/* Facts */}
        <section className="fact-grid" aria-label="Details">
          <div><span className="fact-label">Category</span><span className="fact-value">{item.category || "—"}</span></div>
          <div>
            <span className="fact-label">Set</span>
            {item.set ? (
              <button type="button" className="fact-value fact-link" onClick={() => navigate(`/sets/${item.set!.id}`)}>{item.set.name}</button>
            ) : (
              <span className="fact-value">None</span>
            )}
          </div>
          <div><span className="fact-label">Purchase cost</span><span className="fact-value">{formatCurrency(item.purchase_cost)}</span></div>
          <div><span className="fact-label">Purchased</span><span className="fact-value">{formatCalendarDay(item.purchase_date)}</span></div>
          {formatDimensions(item.width_in, item.depth_in, item.height_in) && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span className="fact-label">Dimensions</span>
              <span className="fact-value">{formatDimensions(item.width_in, item.depth_in, item.height_in)}</span>
            </div>
          )}
          {item.notes && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span className="fact-label">Notes</span>
              <span className="fact-value" style={{ fontWeight: 500, whiteSpace: "pre-wrap" }}>{item.notes}</span>
            </div>
          )}
        </section>

        {/* Unlabeled blank sticker */}
        {item.is_unlabeled && (
          <div className="card" style={{ borderColor: "#F2D9AE", marginBottom: 12 }}>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10 }}>
              This QR label has no furniture details yet. Claim it to fill in the name, category, and photo.
            </p>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => navigate(`/inventory/${id}/claim`)}>
              Claim label
            </button>
          </div>
        )}

        {/* Missing item resolution */}
        {isManager && item.status === "missing" && (
          <div className="card" style={{ borderColor: "#F0C4BE", marginBottom: 12 }}>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 10 }}>
              This item was marked missing when a job was force-completed with it unreturned. If it's turned up, mark it found to put it back in unstaged inventory.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              disabled={markFound.isPending}
              onClick={handleMarkFound}
            >
              {markFound.isPending ? "Marking found…" : "Mark as found"}
            </button>
          </div>
        )}

        {/* Photo */}
        {item.photo_url && (
          <div className="item-hero-photo">
            <img
              src={displayPhotoUrl(item.photo_url)}
              alt={item.name}
            />
          </div>
        )}

        {/* QR code */}
        <QRSection itemId={item.id} qrPrinted={item.qr_printed} canEdit={isManager} />

        {showEdit && item && (
          <EditItemModal item={item} onClose={() => setShowEdit(false)} />
        )}

        </div>
        <div className="detail-side">
        {/* Movement history */}
        <section className="card" aria-labelledby="history-title" style={{ paddingBottom: 6 }}>
          <h2 id="history-title" className="card-title" style={{ marginBottom: 10 }}>History</h2>
          {movements.length === 0 ? (
            <div style={{ display: "flex", gap: 12, paddingBottom: 8 }}>
              <span style={{ width: 10, height: 10, marginTop: 5, borderRadius: "50%", background: "#D8C8EA", flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-secondary)" }}>No moves yet</p>
                <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>Moves to and from jobs show here</p>
              </div>
            </div>
          ) : (
            movements.map((m, i) => (
              <MovementRow key={m.id} movement={m} isLast={i === movements.length - 1} />
            ))
          )}
        </section>

        {/* Manager: duplicate + status override */}
        {isManager && !item.is_unlabeled && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p className="card-title" style={{ marginBottom: 8 }}>
              Manage
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn btn-outline" style={{ width: "100%" }} disabled={duplicateItem.isPending} onClick={handleDuplicate}>
                {duplicateItem.isPending ? "Duplicating…" : "Add another copy (new SKU)"}
              </button>
              <button className="btn btn-outline" style={{ width: "100%" }} onClick={() => {
                setStatusForm({ status: item.status, condition: "good", notes: "", job_id: item.current_job?.id ?? "" });
                setShowStatus(true);
              }}>
                Change status…
              </button>
            </div>
          </div>
        )}

        {/* Manager: remove / delete */}
        {isManager && item.status !== "disposed" && (
          <div className="card" style={{ marginTop: 8, marginBottom: 28, borderColor: "#F0C4BE" }}>
            <p className="card-title" style={{ marginBottom: 8 }}>
              Remove item
            </p>
            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 }}>
              {item.status === "staged"
                ? "This item is currently staged. Return it from the job before removing or deleting."
                : "Dispose keeps the record for history. Delete permanently removes the item and its history (frees the SKU)."}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                className="btn btn-outline"
                style={{ width: "100%", color: "var(--amber-text)", borderColor: "#F2D9AE" }}
                disabled={item.status === "staged" || disposeItem.isPending}
                onClick={() => setConfirmAction("dispose")}
              >
                Dispose (remove from inventory)
              </button>
              <button
                className="btn btn-outline"
                style={{ width: "100%", color: "var(--red-text)", borderColor: "#F0C4BE" }}
                disabled={item.status === "staged" || deleteItem.isPending}
                onClick={() => setConfirmAction("delete")}
              >
                Delete permanently
              </button>
            </div>
          </div>
        )}

        </div>
        </div>

        {confirmAction && (
          <ModalOverlay onClose={() => setConfirmAction(null)}>
            <div
              className="modal-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{ padding: 0, display: "flex", flexDirection: "column" }}
            >
              <div style={{ padding: "16px 18px 0" }}>
                <div className="modal-handle" />
                <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }}>
                  {confirmAction === "delete" ? "Delete permanently?" : "Dispose item?"}
                </p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {confirmAction === "delete"
                    ? `“${item.name}” and all of its movement history will be permanently deleted. This cannot be undone.`
                    : `“${item.name}” will be removed from active inventory. The record stays for history.`}
                </p>
              </div>
              <div
                style={{
                  display: "flex", gap: 8,
                  padding: "12px 18px",
                  paddingBottom: "calc(12px + var(--safe-bottom))",
                  borderTop: "1px solid var(--border)",
                  marginTop: 14,
                }}
              >
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setConfirmAction(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    background: confirmAction === "delete" ? "var(--red-text)" : undefined,
                  }}
                  disabled={disposeItem.isPending || deleteItem.isPending}
                  onClick={confirmAction === "delete" ? handleDelete : handleDispose}
                >
                  {disposeItem.isPending || deleteItem.isPending
                    ? "Working…"
                    : confirmAction === "delete"
                      ? "Delete"
                      : "Dispose"}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {showStatus && (
          <ModalOverlay onClose={() => setShowStatus(false)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ padding: 18 }}>
              <div className="modal-handle" />
              <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>Change status</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select
                  className="input-field"
                  value={statusForm.status}
                  onChange={(e) => setStatusForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="available">Unstaged</option>
                  <option value="staged">Staged</option>
                  <option value="missing">Missing</option>
                  <option value="disposed">Disposed</option>
                </select>
                {statusForm.status === "staged" && (
                  <select
                    className="input-field"
                    value={statusForm.job_id}
                    onChange={(e) => setStatusForm((f) => ({ ...f, job_id: e.target.value }))}
                    required
                  >
                    <option value="">Select job…</option>
                    {jobs
                      .filter((j) => j.status === "planning" || j.status === "active")
                      .map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.address} ({j.status})
                        </option>
                      ))}
                  </select>
                )}
                {(statusForm.status === "available" || statusForm.status === "disposed") && (
                  <select
                    className="input-field"
                    value={statusForm.condition}
                    onChange={(e) => setStatusForm((f) => ({ ...f, condition: e.target.value }))}
                  >
                    <option value="good">Good</option>
                    <option value="damaged">Damaged</option>
                    <option value="dispose">Dispose</option>
                  </select>
                )}
                <input
                  className="input-field"
                  placeholder="Optional note"
                  value={statusForm.notes}
                  onChange={(e) => setStatusForm((f) => ({ ...f, notes: e.target.value }))}
                />
                <button
                  className="btn btn-primary"
                  disabled={setStatus.isPending || (statusForm.status === "staged" && !statusForm.job_id)}
                  onClick={handleSetStatus}
                >
                  {setStatus.isPending ? "Saving…" : "Update status"}
                </button>
                <button className="btn btn-outline" onClick={() => setShowStatus(false)}>Cancel</button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {showAssignJob && (
          <ModalOverlay onClose={() => setShowAssignJob(false)}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ padding: 18 }}>
              <div className="modal-handle" />
              <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Assign to job</p>
              <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 }}>
                This item will be added to the job and marked staged.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <select
                  className="input-field"
                  value={assignJobId}
                  onChange={(e) => setAssignJobId(e.target.value)}
                >
                  <option value="">Select job…</option>
                  {activeJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.address} ({j.status})
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary"
                  disabled={!assignJobId || assignToJob.isPending}
                  onClick={handleAssignToJob}
                >
                  {assignToJob.isPending ? "Assigning…" : "Assign & stage"}
                </button>
                <button className="btn btn-outline" onClick={() => setShowAssignJob(false)}>Cancel</button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </div>
    </div>
  );
}

const SelectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B5A80'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;
const selectStyle = { backgroundImage: SelectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32, appearance: "none" as const };

function EditItemModal({ item, onClose }: { item: ItemDetailType; onClose: () => void }) {
  const { showToast } = useToast();
  const updateItem = useUpdateItem(item.id);
  const createSet = useCreateSet();
  const { data: sets = [] } = useSets();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: item.name,
    category: item.category,
    set_id: item.set_id ?? "",
    condition: item.condition,
    purchase_cost: item.purchase_cost,
    purchase_date: item.purchase_date ? item.purchase_date.slice(0, 10) : "",
    width_in: item.width_in ?? "",
    depth_in: item.depth_in ?? "",
    height_in: item.height_in ?? "",
    notes: item.notes ?? "",
  });
  const [photoUrl, setPhotoUrl] = useState(item.photo_url ?? "");
  const [photoPreview, setPhotoPreview] = useState(displayPhotoUrl(item.photo_url) ?? "");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showNewSet, setShowNewSet] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  const [newSetDescription, setNewSetDescription] = useState("");
  const [newSetError, setNewSetError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreateSet() {
    if (!newSetName.trim()) {
      setNewSetError("Name is required");
      return;
    }
    setNewSetError("");
    try {
      const created = await createSet.mutateAsync({
        name: newSetName.trim(),
        description: newSetDescription.trim(),
      });
      set("set_id", created.id);
      setShowNewSet(false);
      setNewSetName("");
      setNewSetDescription("");
      showToast(`Created set “${created.name}”`, "success");
    } catch (err) {
      setNewSetError(err instanceof ApiError ? err.message : "Failed to create set");
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setUploadProgress(0);
    try {
      const url = await uploadImage(file, setUploadProgress);
      setPhotoUrl(url);
    } catch {
      showToast("Photo upload failed", "error");
      setPhotoPreview(displayPhotoUrl(item.photo_url) ?? "");
    } finally {
      setUploadProgress(null);
    }
  }

  function removePhoto() {
    setPhotoUrl("");
    setPhotoPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (uploadProgress !== null) { setError("Please wait for the photo to finish uploading"); return; }
    setError("");
    try {
      await updateItem.mutateAsync({
        name: form.name.trim(),
        category: form.category,
        set_id: form.set_id || null,
        condition: form.condition,
        purchase_cost: parseFloat(String(form.purchase_cost)) || 0,
        purchase_date: form.purchase_date || null,
        width_in: form.width_in !== "" ? parseFloat(String(form.width_in)) : null,
        depth_in: form.depth_in !== "" ? parseFloat(String(form.depth_in)) : null,
        height_in: form.height_in !== "" ? parseFloat(String(form.height_in)) : null,
        notes: form.notes.trim() || undefined,
        photo_url: photoUrl || undefined,
      });
      showToast("Item updated", "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="modal-sheet animate-in"
        style={{ maxHeight: "min(90dvh, 90vh)", padding: 0, display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div style={{ padding: "20px 18px 0", flexShrink: 0 }}>
          <div className="modal-handle" style={{ margin: "0 auto 16px" }} />
          <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Edit item</p>
          {error && (
            <div style={{ padding: "9px 12px", borderRadius: "var(--radius-md)", background: "var(--red-dim)", color: "var(--red-text)", fontSize: 12.5, marginBottom: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* Scrollable form body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 8px" }}>
          {/* Name */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Name</label>
            <input className="input-field" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          {/* Category + Condition */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label className="form-label">Category</label>
              <select className="input-field" style={selectStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Condition</label>
              <select className="input-field" style={selectStyle} value={form.condition} onChange={(e) => set("condition", e.target.value)}>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="damaged">Damaged</option>
              </select>
            </div>
          </div>

          {/* Set */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Set</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                className="input-field"
                style={{ ...selectStyle, flex: 1 }}
                value={form.set_id}
                onChange={(e) => set("set_id", e.target.value)}
              >
                <option value="">No set</option>
                {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "0 12px", fontSize: 12 }}
                onClick={() => {
                  setNewSetError("");
                  setShowNewSet(true);
                }}
              >
                New set
              </button>
            </div>
          </div>

          {/* Cost + Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label className="form-label">Cost ($)</label>
              <input type="number" min="0" step="0.01" className="input-field" value={form.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Purchase date (optional)</label>
              <input type="date" className="input-field" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
            </div>
          </div>

          {/* Dimensions */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Dimensions in inches (optional)</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <input type="number" min="0" step="0.1" className="input-field" placeholder="W" value={form.width_in} onChange={(e) => set("width_in", e.target.value)} />
              <input type="number" min="0" step="0.1" className="input-field" placeholder="D" value={form.depth_in} onChange={(e) => set("depth_in", e.target.value)} />
              <input type="number" min="0" step="0.1" className="input-field" placeholder="H" value={form.height_in} onChange={(e) => set("height_in", e.target.value)} />
            </div>
          </div>

          {/* Photo */}
          <div style={{ marginBottom: 12 }}>
            <label className="form-label">Photo</label>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
            {!photoPreview ? (
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: "100%", height: 80, border: "1.5px dashed var(--border)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, color: "var(--text-tertiary)" }}>
                <CameraIcon />
                <span style={{ fontSize: 12 }}>Add photo</span>
              </button>
            ) : (
              <div className="photo-preview-frame">
                <img src={photoPreview} alt="Preview" />
                {uploadProgress !== null && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <div style={{ width: "60%", height: 4, background: "rgba(255,255,255,0.3)", borderRadius: 2 }}>
                      <div style={{ width: `${uploadProgress}%`, height: "100%", background: "white", borderRadius: 2, transition: "width 0.1s" }} />
                    </div>
                    <span style={{ fontSize: 12, color: "white" }}>Uploading {uploadProgress}%</span>
                  </div>
                )}
                {uploadProgress === null && (
                  <button type="button" onClick={removePhoto} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "white", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 8 }}>
            <label className="form-label">Notes</label>
            <textarea className="input-field" style={{ resize: "vertical", minHeight: 70 }} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        {/* Pinned buttons */}
        <div style={{ padding: "12px 18px", paddingBottom: "calc(12px + var(--safe-bottom))", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={updateItem.isPending}>
              {updateItem.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {showNewSet && (
        <ModalOverlay
          onClose={() => {
            if (!createSet.isPending) setShowNewSet(false);
          }}
        >
          <div
            className="modal-sheet animate-in"
            style={{ padding: 0, display: "flex", flexDirection: "column" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px 18px 0", flexShrink: 0 }}>
              <div className="modal-handle" style={{ margin: "0 auto 16px" }} />
              <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Create new set</p>
              {newSetError && (
                <div
                  style={{
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--red-dim)",
                    color: "var(--red-text)",
                    fontSize: 12.5,
                    marginBottom: 12,
                  }}
                >
                  {newSetError}
                </div>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 8px" }}>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label" htmlFor="edit-new-set-name">Set name</label>
                <input
                  id="edit-new-set-name"
                  className="input-field"
                  placeholder="e.g. Boho Master Bedroom"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label className="form-label" htmlFor="edit-new-set-desc">Description</label>
                <input
                  id="edit-new-set-desc"
                  className="input-field"
                  placeholder="Short description…"
                  value={newSetDescription}
                  onChange={(e) => setNewSetDescription(e.target.value)}
                />
              </div>
            </div>
            <div
              style={{
                padding: "12px 18px",
                paddingBottom: "calc(12px + var(--safe-bottom))",
                borderTop: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => setShowNewSet(false)}
                  disabled={createSet.isPending}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={handleCreateSet}
                  disabled={createSet.isPending}
                >
                  {createSet.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </ModalOverlay>
  );
}

function movementWord(status: string): string {
  return statusLabel(status);
}

function MovementRow({ movement: m, isLast }: { movement: Movement; isLast: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ width: 10, height: 10, marginTop: 5, borderRadius: "50%", background: movementDotColor(m.to_status) }} />
        {!isLast && <span style={{ width: 2, flex: 1, background: "var(--hairline)", marginTop: 4, minHeight: 16 }} />}
      </div>
      <div style={{ paddingBottom: 14, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>
          {movementWord(m.from_status)} → {movementWord(m.to_status)}
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginTop: 1 }}>
          {formatDate(m.created_at)} · {m.performer.name}
          {m.job && ` · ${m.job.address}`}
        </p>
        {m.notes && (
          <p style={{ fontSize: 13, color: "var(--ink)", marginTop: 2 }}>{m.notes}</p>
        )}
      </div>
    </div>
  );
}
