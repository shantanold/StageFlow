import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminOrganizations } from "../../lib/queries";
import { formatDate } from "../../lib/utils";
import type { AdminOrganization } from "../../types";

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
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

/** Name/slug search (trimmed, case-insensitive), sorted by name. */
export function filterOrganizations(orgs: AdminOrganization[], search: string): AdminOrganization[] {
  const q = search.trim().toLowerCase();
  return orgs
    .filter((o) => !q || o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const labelStyle = {
  fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
  textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: 6,
};

export function Organizations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: orgs = [], isLoading, error } = useAdminOrganizations();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => filterOrganizations(orgs, search), [orgs, search]);

  if (!user?.is_platform_admin) {
    return <Navigate to="/more" replace />;
  }

  const totals = orgs.reduce(
    (t, o) => ({
      users: t.users + o.user_count,
      items: t.items + o.item_count,
      activeJobs: t.activeJobs + o.active_job_count,
    }),
    { users: 0, items: 0, activeJobs: 0 }
  );

  const statCards = [
    { label: "Organizations", value: orgs.length, color: "var(--accent)" },
    { label: "Users",         value: totals.users },
    { label: "Items",         value: totals.items },
    { label: "Active jobs",   value: totals.activeJobs, color: "var(--green)" },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Organizations</h1>
        <p className="page-subtitle">Platform admin · every org on StageFlow</p>
      </div>

      <div className="page-body">
        <div className="stat-grid">
          {statCards.map((card) => (
            <div key={card.label} className="card" style={{ padding: 14 }}>
              <p style={labelStyle}>{card.label}</p>
              <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: card.color }}>
                {isLoading ? "—" : card.value.toLocaleString()}
              </p>
            </div>
          ))}
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
            placeholder="Search name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        {isLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</p>
        ) : error ? (
          <p style={{ fontSize: 13, color: "var(--red-text)" }}>
            {error instanceof Error ? error.message : "Failed to load organizations"}
          </p>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            {orgs.length === 0 ? "No organizations yet." : `No organizations match "${search.trim()}".`}
          </p>
        ) : (
          <div className="list-card">
            {filtered.map((org) => (
              <div
                key={org.id}
                className="list-row"
                style={{ justifyContent: "space-between", opacity: org.is_active ? 1 : 0.6 }}
                onClick={() => navigate(`/admin/organizations/${org.id}`)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {org.name}
                    </p>
                    {!org.is_active && <span className="badge badge-gray">Inactive</span>}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {plural(org.user_count, "user")} · {plural(org.item_count, "item")} · {org.active_job_count} active / {plural(org.job_count, "job")}
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {org.slug} · {org.last_activity_at ? `last activity ${formatDate(org.last_activity_at)}` : "no activity yet"}
                  </p>
                </div>
                <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
                  <ChevronRightIcon />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
