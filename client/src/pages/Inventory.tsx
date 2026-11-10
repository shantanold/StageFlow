import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useItems, useSets } from "../lib/queries";
import { useDebounce } from "../hooks/useDebounce";
import { downloadLabels } from "../lib/labels";
import { displayPhotoUrl } from "../lib/cloudinary";
import { formatCurrency, getCategoryEmoji } from "../lib/utils";
import { BandIconButton, BandWatermark, Icon, ItemStatusPill } from "../components/b2";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { ImportCSVModal } from "./inventory/ImportCSVModal";
import type { Item } from "../types";

type StatusFilter = "all" | "available" | "staged" | "flagged" | "needs_details";
type QrFilter = "all" | "printed" | "unprinted";
type SortKey = "name" | "newest" | "sku" | "status" | "category";
type GroupBy = "category" | "set" | "none";
type ViewMode = "list" | "grid";

const SelectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B5A80'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`;
const selectStyle: import("react").CSSProperties = {
  backgroundImage: SelectArrow,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 28,
  appearance: "none",
  fontSize: 14,
  minHeight: 42,
  paddingTop: 8,
  paddingBottom: 8,
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
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

function ListViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GridViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchesSearch(item: Item, q: string): boolean {
  if (!q) return true;
  const hay = `${item.name} ${item.sku} ${item.category} ${item.set?.name ?? ""}`.toLowerCase();
  return hay.includes(q);
}

function statusRank(item: Item): number {
  if (item.status === "missing" || item.condition === "damaged") return 0;
  if (item.status === "available") return 1;
  if (item.status === "staged") return 2;
  return 3;
}

function sortItems(items: Item[], sort: SortKey): Item[] {
  const copy = [...items];
  copy.sort((a, b) => {
    switch (sort) {
      case "newest":
        return b.created_at.localeCompare(a.created_at);
      case "sku":
        return a.sku.localeCompare(b.sku);
      case "status": {
        const d = statusRank(a) - statusRank(b);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      }
      case "category": {
        const d = a.category.localeCompare(b.category);
        return d !== 0 ? d : a.name.localeCompare(b.name);
      }
      case "name":
      default:
        return a.name.localeCompare(b.name);
    }
  });
  return copy;
}

interface Group {
  key: string;
  label: string;
  emoji: string;
  items: Item[];
  available: number;
  staged: number;
  flagged: number;
}

function buildGroups(items: Item[], groupBy: GroupBy): Group[] {
  if (groupBy === "none") {
    return [{
      key: "all",
      label: "All items",
      emoji: "📦",
      items,
      available: items.filter((i) => i.status === "available").length,
      staged: items.filter((i) => i.status === "staged").length,
      flagged: items.filter((i) => i.condition === "damaged" || i.status === "missing").length,
    }];
  }

  const map = new Map<string, Item[]>();
  for (const item of items) {
    const key = groupBy === "set"
      ? (item.set_id ?? "__none__")
      : (item.category.trim() || "Other");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  const groups: Group[] = [...map.entries()].map(([key, groupItems]) => {
    const label = groupBy === "set"
      ? (key === "__none__" ? "No set" : (groupItems[0]?.set?.name ?? "Set"))
      : key;
    return {
      key,
      label,
      emoji: groupBy === "category" ? getCategoryEmoji(label) : "📦",
      items: groupItems,
      available: groupItems.filter((i) => i.status === "available").length,
      staged: groupItems.filter((i) => i.status === "staged").length,
      flagged: groupItems.filter((i) => i.condition === "damaged" || i.status === "missing").length,
    };
  });

  groups.sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Inventory() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (searchParams.get("filter") as StatusFilter) ?? "all";

  const [filter, setFilter]           = useState<StatusFilter>(initialFilter);
  const [categoryFilter, setCategory] = useState<string>("all");
  const [setIdFilter, setSetIdFilter] = useState<string>("all");
  const [qrFilter, setQrFilter]       = useState<QrFilter>("all");
  const [sort, setSort]               = useState<SortKey>("name");
  const [groupBy, setGroupBy]         = useState<GroupBy>(
    () => (localStorage.getItem("inv_group") as GroupBy) ?? "category"
  );
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set());
  const [search, setSearch]           = useState("");
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [viewMode, setViewMode]       = useState<ViewMode>(
    () => (localStorage.getItem("inv_view") as ViewMode) ?? "list"
  );

  useEffect(() => { localStorage.setItem("inv_view", viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem("inv_group", groupBy); }, [groupBy]);

  const debouncedSearch = useDebounce(search, 200);
  const { data: allItems = [], isLoading } = useItems({});
  const { data: sets = [] } = useSets();

  const live = useMemo(
    () => allItems.filter((i) => i.status !== "disposed"),
    [allItems]
  );

  const claimed = useMemo(
    () => live.filter((i) => !i.is_unlabeled),
    [live]
  );

  const blanks = useMemo(
    () => live.filter((i) => i.is_unlabeled),
    [live]
  );

  const categories = useMemo(() => {
    const set = new Set(claimed.map((i) => i.category.trim() || "Other"));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [claimed]);

  const counts = useMemo(() => ({
    all:           claimed.length,
    available:     claimed.filter((i) => i.status === "available").length,
    staged:        claimed.filter((i) => i.status === "staged").length,
    flagged:       claimed.filter((i) => i.condition === "damaged" || i.status === "missing").length,
    needs_details: blanks.length,
  }), [claimed, blanks]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list =
      filter === "needs_details"
        ? blanks.filter((i) => matchesSearch(i, q))
        : claimed.filter((i) => matchesSearch(i, q));

    if (filter === "available") list = list.filter((i) => i.status === "available");
    if (filter === "staged")    list = list.filter((i) => i.status === "staged");
    if (filter === "flagged")   list = list.filter((i) => i.condition === "damaged" || i.status === "missing");

    if (categoryFilter !== "all") {
      list = list.filter((i) => (i.category.trim() || "Other") === categoryFilter);
    }
    if (setIdFilter === "none") {
      list = list.filter((i) => !i.set_id);
    } else if (setIdFilter !== "all") {
      list = list.filter((i) => i.set_id === setIdFilter);
    }
    if (qrFilter === "printed")   list = list.filter((i) => i.qr_printed);
    if (qrFilter === "unprinted") list = list.filter((i) => !i.qr_printed);

    return sortItems(list, sort);
  }, [claimed, blanks, debouncedSearch, filter, categoryFilter, setIdFilter, qrFilter, sort]);

  const groups = useMemo(() => buildGroups(filtered, groupBy), [filtered, groupBy]);

  const hasExtraFilters =
    categoryFilter !== "all" || setIdFilter !== "all" || qrFilter !== "all" || sort !== "name" || groupBy !== "category";

  function handleFilterChange(f: StatusFilter) {
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

  function toggleGroupCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectGroup(items: Item[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((i) => next.has(i.id));
      items.forEach((i) => (allSelected ? next.delete(i.id) : next.add(i.id)));
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function clearExtraFilters() {
    setCategory("all");
    setSetIdFilter("all");
    setQrFilter("all");
    setSort("name");
    setGroupBy("category");
  }

  async function handlePrintSelected() {
    if (selectedIds.size === 0 || downloading) return;
    setDownloading(true);
    try {
      await downloadLabels([...selectedIds]);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      showToast("Label PDF downloaded", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Download failed", "error");
    } finally {
      setDownloading(false);
    }
  }

  const chips: [StatusFilter, string, number][] = [
    ["all",           "All",           counts.all],
    ["available",     "Unstaged",      counts.available],
    ["staged",        "Staged",        counts.staged],
    ["flagged",       "Flagged",       counts.flagged],
    ["needs_details", "Needs details", counts.needs_details],
  ];
  const totalValue = claimed.reduce((sum, i) => sum + (Number(i.purchase_cost) || 0), 0);

  return (
    <div className="animate-in">
      {/* Header band */}
      <div className="page-header">
        <BandWatermark kind="box" />
        {selectMode ? (
          <div className="band-row">
            <div>
              <h1 className="page-title">Select items</h1>
              <p className="page-subtitle">{selectedIds.size} selected for labels</p>
            </div>
            <button className="btn btn-primary" onClick={exitSelectMode}>Done</button>
          </div>
        ) : (
          <div className="band-row">
            <div style={{ minWidth: 0 }}>
              <h1 className="page-title">Inventory</h1>
              <p className="page-subtitle">
                {filtered.length === claimed.length && filter !== "needs_details"
                  ? `${claimed.length} pieces${totalValue > 0 ? ` · ${formatCurrency(totalValue).replace(/\.00$/, "")}` : ""}`
                  : `${filtered.length} of ${filter === "needs_details" ? blanks.length : claimed.length} pieces`}
              </p>
            </div>
            <div className="band-actions">
              <BandIconButton
                label={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}
                onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
              >
                {viewMode === "list" ? <GridViewIcon /> : <ListViewIcon />}
              </BandIconButton>
              <BandIconButton label="Select items to print labels" onClick={() => setSelectMode(true)}>
                <PrinterIcon />
              </BandIconButton>
              {isManager && (
                <BandIconButton label="Import from CSV" onClick={() => setShowImport(true)}>
                  <UploadIcon />
                </BandIconButton>
              )}
              {isManager && (
                <BandIconButton label="Add item" filled onClick={() => navigate("/inventory/new")}>
                  <Icon.Plus />
                </BandIconButton>
              )}
            </div>
          </div>
        )}

      </div>

      <div className="page-body">
        <label className="band-search field-search" style={{ marginBottom: 12 }}>
          <Icon.Search style={{ width: 18, height: 18, flexShrink: 0 }} />
          <input
            type="search"
            placeholder="Search name, SKU, category, set"
            aria-label="Search name, SKU, category, set"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="band-search-scan"
            aria-label="Scan a label"
            title="Scan a label"
            onClick={() => navigate("/scan/quick")}
          >
            <Icon.Scan />
          </button>
        </label>
        {/* Status chips */}
        <div className="chip-row">
          {chips.map(([key, label, count]) => (
            <button
              key={key}
              className={`chip${filter === key ? " active" : ""}`}
              onClick={() => handleFilterChange(key)}
            >
              {label}
              <span className="chip-count">{count}</span>
            </button>
          ))}
        </div>

        {/* Sort / group / secondary filters */}
        <div className="filter-row">
          <select
            className="input-field"
            style={selectStyle}
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            aria-label="Group by"
          >
            <option value="category">Group: Category</option>
            <option value="set">Group: Set</option>
            <option value="none">Group: None</option>
          </select>
          <select
            className="input-field"
            style={selectStyle}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort by"
          >
            <option value="name">Sort: Name</option>
            <option value="newest">Sort: Newest</option>
            <option value="sku">Sort: SKU</option>
            <option value="status">Sort: Status</option>
            <option value="category">Sort: Category</option>
          </select>
          <select
            className="input-field"
            style={selectStyle}
            value={categoryFilter}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter category"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="input-field"
            style={selectStyle}
            value={setIdFilter}
            onChange={(e) => setSetIdFilter(e.target.value)}
            aria-label="Filter set"
          >
            <option value="all">All sets</option>
            <option value="none">No set</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <select
            className="input-field"
            style={{ ...selectStyle, width: "auto", minWidth: 140 }}
            value={qrFilter}
            onChange={(e) => setQrFilter(e.target.value as QrFilter)}
            aria-label="QR printed filter"
          >
            <option value="all">QR: All</option>
            <option value="unprinted">QR: Needs print</option>
            <option value="printed">QR: Printed</option>
          </select>
          {hasExtraFilters && (
            <button
              className="btn btn-soft"
              style={{ minHeight: 42 }}
              onClick={clearExtraFilters}
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          viewMode === "grid" ? <ItemGridSkeleton /> : <ItemListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState search={search} filter={filter} />
        ) : (
          <div style={{ paddingBottom: selectMode ? 100 : 24 }}>
            {groups.map((group) => {
              const open = groupBy === "none" || !collapsed.has(group.key);
              const allSelected = group.items.length > 0 && group.items.every((i) => selectedIds.has(i.id));
              return (
                <section key={group.key} style={{ marginBottom: groupBy === "none" ? 0 : 16 }}>
                  {groupBy !== "none" && (
                    <div className="inv-group-head">
                      <button
                        type="button"
                        className="inv-group-toggle"
                        aria-expanded={open}
                        onClick={() => toggleGroupCollapse(group.key)}
                      >
                        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>
                            {group.label}
                            <span style={{ fontWeight: 600, color: "var(--ink-secondary)", marginLeft: 6 }}>{group.items.length}</span>
                          </span>
                          <span className="inv-group-summary">
                            {group.staged > 0 && <span><i style={{ background: "var(--teal)" }} />{group.staged} staged</span>}
                            {group.available > 0 && <span><i style={{ background: "var(--green)" }} />{group.available} unstaged</span>}
                            {group.flagged > 0 && <span><i style={{ background: "var(--red)" }} />{group.flagged} flagged</span>}
                          </span>
                        </span>
                        <Icon.ChevronDown className="chevron" style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                      </button>
                      {selectMode && (
                        <button
                          className="btn btn-soft"
                          style={{ minHeight: 32, padding: "4px 12px", fontSize: 13 }}
                          onClick={() => selectGroup(group.items)}
                        >
                          {allSelected ? "Deselect" : "Select all"}
                        </button>
                      )}
                    </div>
                  )}

                  {open && (
                    viewMode === "grid" ? (
                      <div className="item-photo-grid">
                        {group.items.map((item) => (
                          <GridItem
                            key={item.id}
                            item={item}
                            selectMode={selectMode}
                            selected={selectedIds.has(item.id)}
                            onToggle={() => toggleItem(item.id)}
                            onClick={() => !selectMode && navigate(item.is_unlabeled ? `/inventory/${item.id}/claim` : `/inventory/${item.id}`)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="list-card" style={{ marginBottom: 4 }}>
                        {group.items.map((item) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            selectMode={selectMode}
                            selected={selectedIds.has(item.id)}
                            onToggle={() => toggleItem(item.id)}
                            onClick={() => !selectMode && navigate(item.is_unlabeled ? `/inventory/${item.id}/claim` : `/inventory/${item.id}`)}
                            showCategory={groupBy !== "category"}
                          />
                        ))}
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {showImport && <ImportCSVModal onClose={() => setShowImport(false)} />}

      {selectMode && (
        <div className="sticky-action-bar">
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-secondary)" }}>
            {selectedIds.size === 0 ? "Tap items to select" : `${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} selected`}
          </p>
          <button
            className="btn btn-primary"
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
  item, selectMode, selected, onToggle, onClick, showCategory,
}: {
  item: Item;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onClick: () => void;
  showCategory?: boolean;
}) {
  const photo = displayPhotoUrl(item.photo_url);
  return (
    <div
      className="list-row"
      role="button"
      tabIndex={0}
      aria-pressed={selectMode ? selected : undefined}
      style={{ background: selected ? "var(--lilac)" : undefined }}
      onClick={selectMode ? onToggle : onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (selectMode ? onToggle : onClick)(); } }}
    >
      {selectMode && <SelectBox selected={selected} />}
      <div className="thumb">
        {photo ? <img src={photo} alt="" /> : <span aria-hidden>{getCategoryEmoji(item.category)}</span>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span className="sku">{item.sku}</span>
          {showCategory && <span> · {item.category}</span>}
          {item.set && <span> · {item.set.name}</span>}
          {!item.qr_printed && <span> · QR not printed</span>}
        </div>
      </div>

      <ItemStatusPill status={item.status} condition={item.condition} />
    </div>
  );
}

function SelectBox({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
        border: `2px solid ${selected ? "var(--brand)" : "var(--field-border)"}`,
        background: selected ? "var(--brand)" : "#fff",
        color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {selected && <CheckIcon />}
    </span>
  );
}

function GridItem({
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
      onClick={selectMode ? onToggle : onClick}
      style={{
        borderRadius: 18,
        border: `${selected ? 2 : 1}px solid ${selected ? "var(--brand)" : "var(--hairline)"}`,
        background: "#fff",
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
      }}
    >
      <div
        className="photo-frame"
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          fontSize: 44,
          position: "relative",
        }}
      >
        {displayPhotoUrl(item.photo_url) ? (
          <img src={displayPhotoUrl(item.photo_url)} alt={item.name} className="photo-contain" />
        ) : (
          getCategoryEmoji(item.category)
        )}

        <span style={{ position: "absolute", bottom: 8, left: 8 }}>
          <ItemStatusPill status={item.status} condition={item.condition} />
        </span>

        {selectMode && (
          <span style={{ position: "absolute", top: 8, right: 8 }}>
            <SelectBox selected={selected} />
          </span>
        )}
      </div>

      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.category}
          {item.set ? ` · ${item.set.name}` : ""}
        </div>
      </div>
    </div>
  );
}

function ItemListSkeleton() {
  return (
    <div className="list-card">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="list-row" style={{ pointerEvents: "none" }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 13, width: "55%", marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 10, width: "35%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemGridSkeleton() {
  return (
    <div className="item-photo-grid">
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{ borderRadius: 18, border: "1px solid var(--hairline)", background: "#fff", overflow: "hidden" }}>
          <div className="skeleton" style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 0 }} />
          <div style={{ padding: "8px 10px 10px" }}>
            <div className="skeleton" style={{ height: 12, width: "70%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ search, filter }: { search: string; filter: StatusFilter }) {
  const msg = search
    ? `No items match "${search}"`
    : filter === "flagged"
    ? "No damaged or missing items"
    : `No ${filter === "all" ? "" : filter + " "}items match these filters`;

  return (
    <div className="card empty-state">
      <p className="empty-state-title">Nothing here</p>
      <p>{msg}</p>
    </div>
  );
}
