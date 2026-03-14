import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSet, useSetItems } from "../../lib/queries";
import { downloadLabels } from "../../lib/labels";
import { getCategoryEmoji, statusBadgeClass, statusLabel } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import type { Item } from "../../types";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
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
  const [printing, setPrinting] = useState(false);

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
        <button className="back-btn" onClick={() => navigate("/sets")} style={{ marginBottom: 8 }}>
          <BackIcon /> Sets
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 18 }}>{set.name}</h1>
            {set.description && (
              <p className="page-subtitle">{set.description}</p>
            )}
          </div>
          {items.length > 0 && (
            <button
              className="btn btn-outline"
              style={{ padding: "7px 12px", fontSize: 12, gap: 5, flexShrink: 0, marginLeft: 8 }}
              onClick={handlePrintAll}
              disabled={printing}
              title="Print all labels for this set"
            >
              <PrinterIcon />
              {printing ? "…" : "Print all"}
            </button>
          )}
        </div>
      </div>

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
