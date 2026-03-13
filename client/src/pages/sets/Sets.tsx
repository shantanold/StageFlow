import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSets, useCreateSet } from "../../lib/queries";
import { ApiError } from "../../lib/api";
import type { ItemSet } from "../../types";

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Sets() {
  const navigate = useNavigate();
  const { data: sets = [], isLoading } = useSets();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div>
          <h1 className="page-title">Sets</h1>
          <p className="page-subtitle">{sets.length} furniture sets</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: "8px 14px", fontSize: 12, gap: 5 }}
          onClick={() => setShowCreate(true)}
        >
          <PlusIcon /> New set
        </button>
      </div>

      <div style={{ padding: "0 18px" }}>
        {isLoading ? (
          <SetListSkeleton />
        ) : sets.length === 0 ? (
          <EmptyState onCreateClick={() => setShowCreate(true)} />
        ) : (
          sets.map((s) => (
            <SetCard key={s.id} set={s} onClick={() => navigate(`/sets/${s.id}`)} />
          ))
        )}
      </div>

      {showCreate && <CreateSetModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function SetCard({ set, onClick }: { set: ItemSet; onClick: () => void }) {
  const allOut  = set.available_count === 0 && set.item_count > 0;
  const allIn   = set.available_count === set.item_count;
  const avBadge = allOut ? "badge badge-red" : allIn ? "badge badge-green" : "badge badge-amber";

  return (
    <div className="card" style={{ cursor: "pointer" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, marginRight: 8 }}>
          <p style={{ fontSize: 15, fontWeight: 500 }}>{set.name}</p>
          {set.description && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
              {set.description}
            </p>
          )}
        </div>
        <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
          <ChevronRightIcon />
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <span className="badge badge-gray">{set.item_count} item{set.item_count !== 1 ? "s" : ""}</span>
        <span className={avBadge}>{set.available_count} available</span>
        {set.staged_count > 0 && (
          <span className="badge badge-blue">{set.staged_count} staged</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div
      style={{
        background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "40px 16px", textAlign: "center",
      }}
    >
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12 }}>
        No sets yet. Group related items to stage them together.
      </p>
      <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13 }} onClick={onCreateClick}>
        Create first set
      </button>
    </div>
  );
}

function SetListSkeleton() {
  return (
    <>
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="card"
          style={{ pointerEvents: "none" }}
        >
          <div style={{ height: 15, width: "60%", background: "var(--bg-surface)", borderRadius: 4, marginBottom: 6 }} />
          <div style={{ height: 11, width: "40%", background: "var(--bg-surface)", borderRadius: 3, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ height: 20, width: 70, background: "var(--bg-surface)", borderRadius: 10 }} />
            <div style={{ height: 20, width: 80, background: "var(--bg-surface)", borderRadius: 10 }} />
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Create Set Modal ─────────────────────────────────────────────────────────

function CreateSetModal({ onClose }: { onClose: () => void }) {
  const createSet = useCreateSet();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");
    try {
      await createSet.mutateAsync({ name: name.trim(), description: description.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Create new set</p>

        {error && (
          <div
            style={{
              padding: "9px 12px", borderRadius: "var(--radius-md)",
              background: "var(--red-dim)", color: "var(--red-text)",
              fontSize: 12.5, marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="form-label" htmlFor="set-name">Set name</label>
          <input
            id="set-name"
            className="input-field"
            placeholder="e.g. Boho Master Bedroom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="form-label" htmlFor="set-desc">Description</label>
          <input
            id="set-desc"
            className="input-field"
            placeholder="Short description…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleCreate}
            disabled={createSet.isPending}
          >
            {createSet.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
