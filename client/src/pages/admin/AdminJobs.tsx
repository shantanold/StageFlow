import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import { useAdminJobs, useAdminOrganizations } from "../../lib/queries";
import { useDebounce } from "../../hooks/useDebounce";
import { ApiError } from "../../lib/api";
import { formatCalendarDayShort, jobStatusBadgeClass } from "../../lib/utils";
import type { AdminJob } from "../../types";

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

const STATUS_CHIPS: [string, string][] = [
  ["", "All"],
  ["planning", "Planning"],
  ["active", "Active"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];

/**
 * Platform admin: jobs across every org. Tapping one enters its org and opens
 * the normal job page, where every job action is available.
 */
export function AdminJobs() {
  const { user, enterOrg } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const orgId = searchParams.get("org") ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 250);

  const { data: orgs = [] } = useAdminOrganizations();
  const { data, isLoading, error } = useAdminJobs({ org_id: orgId, search: debouncedSearch, status });

  if (!user?.is_platform_admin) {
    return <Navigate to="/more" replace />;
  }

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const sortedOrgs = [...orgs].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  function setOrg(id: string) {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("org", id); else next.delete("org");
    setSearchParams(next, { replace: true });
  }

  async function open(job: AdminJob) {
    setOpening(job.id);
    try {
      await enterOrg(job.org.id);
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Couldn't open this job", "error");
      setOpening(null);
    }
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">All Jobs</h1>
        <p className="page-subtitle">
          Platform admin · {isLoading ? "loading…" : jobs.length < total ? `showing ${jobs.length} of ${total.toLocaleString()}` : `${total.toLocaleString()} jobs`}
        </p>
      </div>

      <div className="page-body">
        <div className="filter-row" style={{ marginBottom: 10 }}>
          <select className="input-field" value={orgId} onChange={(e) => setOrg(e.target.value)} aria-label="Organization">
            <option value="">All organizations</option>
            {sortedOrgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div style={{ position: "relative", marginBottom: 10 }}>
          <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", display: "flex", color: "var(--text-tertiary)" }}>
            <SearchIcon />
          </div>
          <input
            className="input-field"
            placeholder="Search address, city or client…"
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
          <p style={{ fontSize: 13, color: "var(--red-text)" }}>{error instanceof Error ? error.message : "Failed to load jobs"}</p>
        ) : jobs.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No jobs match these filters.</p>
        ) : (
          <div className="list-card">
            {jobs.map((job) => (
              <div key={job.id} className="list-row" style={{ justifyContent: "space-between", opacity: opening && opening !== job.id ? 0.5 : 1 }} onClick={() => !opening && open(job)}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {job.address}
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {job.org.name} · {job.client_name} · {job.item_count} item{job.item_count === 1 ? "" : "s"}
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                    {[job.city, job.state].filter(Boolean).join(", ")}
                    {job.expected_end_date ? ` · ends ${formatCalendarDayShort(job.expected_end_date)}` : ""}
                  </p>
                </div>
                <span className={jobStatusBadgeClass(job.status)} style={{ textTransform: "capitalize", flexShrink: 0 }}>
                  {opening === job.id ? "Opening…" : job.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
