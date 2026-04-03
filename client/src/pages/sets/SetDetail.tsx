import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSet, useSetItems, useUpdateSet } from "../../lib/queries";
import { downloadLabels } from "../../lib/labels";
import { getCategoryEmoji, statusBadgeClass, statusLabel } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { ApiError } from "../../lib/api";
import type { Item, ItemSet } from "../../types";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

export function SetDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const [printing, setPrinting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const { data: set, isLoading: setLoading } = useSet(id);
  const { data: items = [], isLoading: itemsLoading } = useSetItems(id);

  async function handlePrintAll() {
    if (items.length === 0 || printing) return;
    setPrinting(true);
    try {
      await downloadLabels(items.map((i) => i.id));
      showToast("Label PDF downloaded", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Download failed", "error");
    } finally {
      setPrinting(false);
    }
  }

  if (setLoading) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  if (!set) {
    return (
      <div style={{ padding: "40px 18px", textAlign: "center" }}>
        <p style={{ color: "var(--red-text)", fontSize: 13 }}>Set not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <button className="back-btn" onClick={() => navigate("/sets")}>
            <BackIcon /> Sets
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            {items.length > 0 && (
              <button className="btn btn-outline" style={{ padding: "7px 12px", fontSize: 12, gap: 5 }} onClick={handlePrintAll} disabled={printing} title="Print all labels">
                <PrinterIcon />{printing ? "…" : "Print all"}
              </button>
            )}
            {isManager && (
              <button className="btn btn-outline" style={{ padding: "7px 12px", fontSize: 12, gap: 5 }} onClick={() => setShowEdit(true)}>
                <EditIcon /> Edit
              </button>
            )}
          </div>
        </div>
        <div>
          <h1 className="page-title" style={{ fontSize: 18 }}>{set.name}</h1>
          {set.description && <p className="page-subtitle">{set.description}</p>}
        </div>
      </div>

      {showEdit && <EditSetModal set={set} onClose={() => setShowEdit(false)} />}

      <div style={{ padding: "0 18px" }}>
        {/* Summary badges */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <span className="badge badge-gray">
            {set.item_count} item{set.item_count !== 1 ? "s" : ""}
          </span>
          {set.available_count > 0 && (
            <span className="badge badge-green">{set.available_count} available</span>
          )}
          {set.staged_count > 0 && (
            <span className="badge badge-blue">{set.staged_count} staged</span>
          )}
        </div>

        {/* Items */}
        {itemsLoading ? (
          <div className="list-card">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="list-row" style={{ pointerEvents: "none" }}>
                <div style={{ width: 42, height: 42, borderRadius: 6, background: "var(--bg-surface)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, width: "55%", background: "var(--bg-surface)", borderRadius: 4, marginBottom: 6 }} />
                  <div style={{ height: 10, width: "30%", background: "var(--bg-surface)", borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "32px 16px", textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No items in this set yet.</p>
          </div>
        ) : (
          <div className="list-card">
            {items.map((item) => (
              <SetItemRow
                key={item.id}
                item={item}
                onClick={() => navigate(`/inventory/${item.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditSetModal({ set, onClose }: { set: ItemSet; onClose: () => void }) {
  const { showToast } = useToast();
  const updateSet = useUpdateSet(set.id);
  const [name, setName] = useState(set.name);
  const [description, setDescription] = useState(set.description ?? "");
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");
    try {
      await updateSet.mutateAsync({ name: name.trim(), description: description.trim() });
      showToast("Set updated", "success");
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Edit set</p>

        {error && (
          <div style={{ padding: "9px 12px", borderRadius: "var(--radius-md)", background: "var(--red-dim)", color: "var(--red-text)", fontSize: 12.5, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="form-label">Set name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="form-label">Description</label>
          <input className="input-field" placeholder="Short description…" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={updateSet.isPending}>
            {updateSet.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetItemRow({ item, onClick }: { item: Item; onClick: () => void }) {
  return (
    <div className="list-row" onClick={onClick}>
      <div
        style={{
          width: 42, height: 42, borderRadius: 6,
          background: "var(--bg-surface)", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20,
        }}
      >
        {getCategoryEmoji(item.category)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 13.5, fontWeight: 500,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.8 }}>
            {item.sku}
          </span>
          {" · "}{item.category}
        </p>
      </div>
      <span className={statusBadgeClass(item.status, item.condition)}>
        {statusLabel(item.status, item.condition)}
      </span>
    </div>
  );
}
