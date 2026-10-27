import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminItemAction, useAdminItems, useAdminOrganizations, type AdminItemAction } from "../../lib/queries";
import { useToast } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api";
import { ModalOverlay } from "../../components/ModalOverlay";
import type { AdminItem } from "../../types";
import { useDebounce } from "../../hooks/useDebounce";
import { displayPhotoUrl } from "../../lib/cloudinary";
import { formatCurrency, getCategoryEmoji, statusBadgeClass, statusLabel } from "../../lib/utils";

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/** Actions offered for an item, given its status (the item routes enforce the same rules). */
export function itemActionsFor(item: Pick<AdminItem, "status">): { label: string; action: AdminItemAction; danger?: boolean }[] {
  switch (item.status) {
    case "available":
      return [
        { label: "Mark missing", action: { kind: "status", status: "missing" }, danger: true },
        { label: "Dispose", action: { kind: "dispose" }, danger: true },
      ];
    case "staged":
      return [
        { label: "Return to unstaged", action: { kind: "status", status: "available" } },
        { label: "Mark missing", action: { kind: "status", status: "missing" }, danger: true },
      ];
    case "missing":
      return [
        { label: "Mark found", action: { kind: "found" } },
        { label: "Dispose", action: { kind: "dispose" }, danger: true },
      ];
    case "disposed":
      return [{ label: "Restore to unstaged", action: { kind: "status", status: "available" } }];
    default:
      return [];
  }
}

function ItemSheet({ item, onClose }: { item: AdminItem; onClose: () => void }) {
  const { enterOrg } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const act = useAdminItemAction();

  async function run(action: AdminItemAction, done: string) {
    try {
      await act.mutateAsync({ orgId: item.org.id, itemId: item.id, action });
      showToast(done, "success");
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update item", "error");
    }
  }

  async function openInOrg() {
    try {
      await enterOrg(item.org.id);
      navigate(`/inventory/${item.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't enter this organization", "error");
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <p style={{ fontSize: 17, fontWeight: 500 }}>{item.name}</p>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 2, marginBottom: 14 }}>
          {item.sku} · {item.org.name}
        </p>

        <label className="form-label">Condition</label>
        <select
          className="input-field"
          value={item.condition}
          disabled={act.isPending}
          onChange={(e) => run({ kind: "condition", condition: e.target.value as "good" | "fair" | "damaged" }, "Condition updated")}
          style={{ marginBottom: 16 }}
        >
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="damaged">Damaged</option>
        </select>

        <label className="form-label">Status · {statusLabel(item.status)}</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {itemActionsFor(item).map(({ label, action, danger }) => (
            <button
              key={label}
              className="btn btn-outline"
              style={{ fontSize: 12.5, padding: "8px 14px", ...(danger && { borderColor: "rgba(239,68,68,0.4)", color: "var(--red-text)" }) }}
              disabled={act.isPending}
              onClick={() => run(action, `${item.name}: ${label.toLowerCase()}`)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={openInOrg}>Open in {item.org.name}</button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 12 }}>
          Changes are recorded in the item's history under your name.
        </p>
      </div>
    </ModalOverlay>
  );
}

const STATUS_CHIPS: [string, string][] = [
  ["", "All"],
  ["available", "Unstaged"],
  ["staged", "Staged"],
  ["missing", "Missing"],
  ["disposed", "Disposed"],
];

/**
 * Platform admin: furniture across every org, read-only. The org filter lives
 * in the URL (?org=) so an org's detail page can link straight to its items.
 */
export function AdminFurniture() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const orgId = searchParams.get("org") ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: orgs = [] } = useAdminOrganizations();
  const { data, isLoading, error } = useAdminItems({ org_id: orgId, search: debouncedSearch, status });

  if (!user?.is_platform_admin) {
    return <Navigate to="/more" replace />;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const sortedOrgs = [...orgs].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  function setOrg(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("org", id); else next.delete("org");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">All Furniture</h1>
        <p className="page-subtitle">
          Platform admin · {isLoading ? "loading…" : items.length < total ? `showing ${items.length} of ${total.toLocaleString()}` : `${total.toLocaleString()} items`}
        </p>
      </div>

      <div className="page-body">
        <div className="filter-row" style={{ marginBottom: 10 }}>
          <select
            className="input-field"
            value={orgId}
            onChange={(e) => setOrg(e.target.value)}
            aria-label="Organization"
          >
            <option value="">All organizations</option>
            {sortedOrgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div style={{ position: "relative", marginBottom: 10 }}>
          <div
            style={{
              position: "absolute", left: 11, top: "50%",
              transform: "translateY(-50%)", display: "flex", color: "var(--text-tertiary)",
            }}
          >
            <SearchIcon />
          </div>
          <input
            className="input-field"
            placeholder="Search name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        <div className="chip-row">
          {STATUS_CHIPS.map(([key, label]) => (
            <button key={key || "all"} className={`chip${status === key ? " active" : ""}`} onClick={() => setStatus(key)}>
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</p>
        ) : error ? (
          <p style={{ fontSize: 13, color: "var(--red-text)" }}>
            {error instanceof Error ? error.message : "Failed to load furniture"}
          </p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No furniture matches these filters.</p>
        ) : (
          <div className="list-card">
            {items.map((item) => (
              <div key={item.id} className="list-row" onClick={() => setSelectedId(item.id)}>
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 6,
                    background: "var(--bg-surface)", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, overflow: "hidden",
                  }}
                >
                  {displayPhotoUrl(item.photo_url) ? (
                    <img src={displayPhotoUrl(item.photo_url)} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    getCategoryEmoji(item.category)
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.name}
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.sku} · {item.org.name}{item.set ? ` · ${item.set.name}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span className={statusBadgeClass(item.status, item.condition)}>{statusLabel(item.status, item.condition)}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{formatCurrency(item.purchase_cost)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedId && items.find((i) => i.id === selectedId) && (
        <ItemSheet item={items.find((i) => i.id === selectedId)!} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
