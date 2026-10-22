import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminItems, useAdminOrganizations } from "../../lib/queries";
import { useDebounce } from "../../hooks/useDebounce";
import { displayPhotoUrl } from "../../lib/cloudinary";
import { formatCurrency, getCategoryEmoji, statusBadgeClass, statusLabel } from "../../lib/utils";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const orgId = searchParams.get("org") ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const debouncedSearch = useDebounce(search, 250);

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
        <button className="back-btn" onClick={() => navigate("/admin/organizations")} style={{ marginBottom: 8 }}>
          <BackIcon /> Organizations
        </button>
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
              <div key={item.id} className="list-row" style={{ cursor: "default" }}>
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
    </div>
  );
}
