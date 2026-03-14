import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useItems } from "../lib/queries";
import { useDebounce } from "../hooks/useDebounce";
import { downloadLabels } from "../lib/labels";
import { getCategoryEmoji, statusBadgeClass, statusLabel } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import type { Item } from "../types";

type FilterKey = "all" | "available" | "staged" | "flagged";

// ─── Icons ────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)" }}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Inventory() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (searchParams.get("filter") as FilterKey) ?? "all";

  const [filter, setFilter]         = useState<FilterKey>(initialFilter);
  const [search, setSearch]         = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const debouncedSearch = useDebounce(search, 250);

  const apiFilters = {
    search:    debouncedSearch || undefined,
    status:    filter === "available" ? "available" : filter === "staged" ? "staged" : undefined,
    condition: filter === "flagged" ? "damaged" : undefined,
  };

  const { data: allItems = [], isLoading } = useItems(apiFilters);
  const liveItems = allItems.filter((i) => i.status !== "disposed");

  const { data: allForCounts = [] } = useItems({});
  const live = allForCounts.filter((i) => i.status !== "disposed");
  const counts = {
    all:       live.length,
    available: live.filter((i) => i.status === "available").length,
    staged:    live.filter((i) => i.status === "staged").length,
    flagged:   live.filter((i) => i.condition === "damaged").length,
  };

  function handleFilterChange(f: FilterKey) {
    setFilter(f);
    setSearchParams(f === "all" ? {} : { filter: f }, { replace: true });
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handlePrintSelected() {
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

  const chips: [FilterKey, string][] = [
    ["all",       `All (${counts.all})`],
    ["available", `Available (${counts.available})`],
    ["staged",    `Staged (${counts.staged})`],
    ["flagged",   `Flagged (${counts.flagged})`],
  ];

  return (
    <div className="animate-in">
      {/* Header */}
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        {selectMode ? (
          <>
            <div>
              <h1 className="page-title">Select items</h1>
              <p className="page-subtitle">{selectedIds.size} selected</p>
            </div>
            <button className="btn btn-outline" style={{ padding: "7px 14px", fontSize: 12 }} onClick={exitSelectMode}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <div>
              <h1 className="page-title">Inventory</h1>
              <p className="page-subtitle">{live.length} items total</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn btn-outline"
                style={{ padding: "7px 12px", fontSize: 12 }}
                onClick={() => setSelectMode(true)}
                title="Select for printing"
              >
                <PrinterIcon />
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: "8px 14px", fontSize: 12, gap: 5 }}
                onClick={() => navigate("/inventory/new")}
              >
                <PlusIcon /> Add
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <div
            style={{
              position: "absolute", left: 11, top: "50%",
              transform: "translateY(-50%)", display: "flex",
            }}
          >
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

        {/* Filter chips */}
        <div className="chip-row">
          {chips.map(([key, label]) => (
            <button
              key={key}
              className={`chip${filter === key ? " active" : ""}`}
              onClick={() => handleFilterChange(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <ItemListSkeleton />
        ) : liveItems.length === 0 ? (
          <EmptyState search={search} filter={filter} />
        ) : (
          <div className="list-card">
            {liveItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                selectMode={selectMode}
                selected={selectedIds.has(item.id)}
                onToggle={() => toggleItem(item.id)}
                onClick={() => !selectMode && navigate(`/inventory/${item.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Print action bar */}
      {selectMode && (
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
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {selectedIds.size === 0 ? "Tap items to select" : `${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} selected`}
          </p>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 14px", fontSize: 12, gap: 6 }}
            disabled={selectedIds.size === 0 || downloading}
            onClick={handlePrintSelected}
          >
            <PrinterIcon />
            {downloading ? "Generating…" : `Print Labels (${selectedIds.size})`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemRow({
  item, selectMode, selected, onToggle, onClick,
}: {
  item: Item;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="list-row"
      style={{ background: selected ? "rgba(59,130,246,0.08)" : undefined }}
      onClick={selectMode ? onToggle : onClick}
    >
      {/* Checkbox (select mode) or emoji thumb */}
      {selectMode ? (
        <div
          style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${selected ? "var(--accent)" : "rgba(148,163,184,0.3)"}`,
            background: selected ? "var(--accent)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {selected && <CheckIcon />}
        </div>
      ) : (
        <div
          style={{
            width: 42, height: 42, borderRadius: 6,
            background: "var(--bg-surface)", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}
        >
          {getCategoryEmoji(item.category)}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.name}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, opacity: 0.8 }}>{item.sku}</span>
          {item.set && <span> · {item.set.name}</span>}
        </div>
      </div>

      <span className={statusBadgeClass(item.status, item.condition)}>
        {statusLabel(item.status, item.condition)}
      </span>
    </div>
  );
}

function ItemListSkeleton() {
  return (
    <div className="list-card">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="list-row" style={{ pointerEvents: "none" }}>
          <div style={{ width: 42, height: 42, borderRadius: 6, background: "var(--bg-surface)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, borderRadius: 4, background: "var(--bg-surface)", width: "55%", marginBottom: 6 }} />
            <div style={{ height: 10, borderRadius: 3, background: "var(--bg-surface)", width: "35%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ search, filter }: { search: string; filter: FilterKey }) {
  const msg = search
    ? `No items match "${search}"`
    : filter === "flagged"
    ? "No damaged items — all in good shape!"
    : `No ${filter === "all" ? "" : filter + " "}items yet`;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "40px 16px", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{msg}</p>
    </div>
  );
}
