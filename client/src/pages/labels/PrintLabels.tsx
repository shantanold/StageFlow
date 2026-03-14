import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useItems } from "../../lib/queries";
import { useDebounce } from "../../hooks/useDebounce";
import { downloadLabels } from "../../lib/labels";
import { getCategoryEmoji, statusBadgeClass, statusLabel } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PrintLabels() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [search, setSearch]           = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const debouncedSearch = useDebounce(search, 200);
  const { data: allItems = [], isLoading } = useItems({});
  const live = allItems.filter((i) => i.status !== "disposed");

  const filtered = useMemo(() => {
    if (!debouncedSearch) return live;
    const q = debouncedSearch.toLowerCase();
    return live.filter(
      (i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
    );
  }, [live, debouncedSearch]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((i) => next.delete(i.id));
      } else {
        filtered.forEach((i) => next.add(i.id));
      }
      return next;
    });
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handlePrint() {
    if (selectedIds.size === 0 || downloading) return;
    setDownloading(true);
    try {
      await downloadLabels([...selectedIds]);
      showToast("Label PDF downloaded", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Download failed", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/more")} style={{ marginBottom: 8 }}>
          <BackIcon /> More
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 className="page-title">Print QR Labels</h1>
            <p className="page-subtitle">Select items for the label sheet</p>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
            <SearchIcon />
          </div>
          <input
            className="input-field"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        {/* Select-all row */}
        {!isLoading && filtered.length > 0 && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0", marginBottom: 4,
              cursor: "pointer",
            }}
            onClick={toggleSelectAll}
          >
            <div
              style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                border: `2px solid ${allFilteredSelected ? "var(--accent)" : "rgba(148,163,184,0.3)"}`,
                background: allFilteredSelected ? "var(--accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {allFilteredSelected && <CheckIcon />}
            </div>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {allFilteredSelected ? "Deselect all" : `Select all (${filtered.length})`}
            </span>
          </div>
        )}

        {/* Item list */}
        {isLoading ? (
          <LabelSkeleton />
        ) : filtered.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "36px 16px", textAlign: "center",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              {search ? `No items match "${search}"` : "No items in inventory yet"}
            </p>
          </div>
        ) : (
          <div className="list-card" style={{ marginBottom: 100 }}>
            {filtered.map((item) => {
              const selected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className="list-row"
                  style={{ background: selected ? "rgba(59,130,246,0.08)" : undefined }}
                  onClick={() => toggle(item.id)}
                >
                  <div
                    style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      border: `2px solid ${selected ? "var(--accent)" : "rgba(148,163,184,0.3)"}`,
                      background: selected ? "var(--accent)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {selected && <CheckIcon />}
                  </div>

                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                      background: "var(--bg-surface)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}
                  >
                    {getCategoryEmoji(item.category)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
                      <span style={{ fontFamily: "var(--font-mono)" }}>{item.sku}</span>
                      {item.set && <span> · {item.set.name}</span>}
                    </div>
                  </div>

                  <span className={statusBadgeClass(item.status, item.condition)}>
                    {statusLabel(item.status, item.condition)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky print bar */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(70px + env(safe-area-inset-bottom, 0px))",
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          padding: "10px 18px",
          background: "var(--bg-card)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 99,
        }}
      >
        <div>
          <p style={{ fontSize: 13, fontWeight: 500 }}>
            {selectedIds.size === 0
              ? "No items selected"
              : `${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} selected`}
          </p>
          {selectedIds.size > 0 && (
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
              {Math.ceil(selectedIds.size / 30)} page{Math.ceil(selectedIds.size / 30) !== 1 ? "s" : ""} · 30 labels/page
            </p>
          )}
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: "9px 16px", fontSize: 13, gap: 6 }}
          disabled={selectedIds.size === 0 || downloading}
          onClick={handlePrint}
        >
          <PrinterIcon />
          {downloading ? "Generating…" : "Print Labels"}
        </button>
      </div>
    </div>
  );
}

function LabelSkeleton() {
  return (
    <div className="list-card">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="list-row" style={{ pointerEvents: "none" }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: "var(--bg-surface)" }} />
          <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--bg-surface)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, width: "55%", background: "var(--bg-surface)", borderRadius: 4, marginBottom: 6 }} />
            <div style={{ height: 10, width: "30%", background: "var(--bg-surface)", borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
