import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useAdminOrganization } from "../../lib/queries";
import { formatDate, jobStatusBadgeClass, statusBadgeClass, statusLabel } from "../../lib/utils";

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

const ITEM_STATUS_ORDER = ["available", "staged", "missing", "disposed"];
const JOB_STATUS_ORDER = ["planning", "active", "completed", "cancelled"];

/** Known statuses first in a fixed order, then anything else; zero counts dropped. */
export function orderedCounts(counts: Record<string, number>, order: string[]): [string, number][] {
  const rank = (s: string) => (order.includes(s) ? order.indexOf(s) : order.length);
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

const labelStyle = {
  fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
  textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: 8,
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-row" style={{ justifyContent: "space-between", cursor: "default" }}>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 500, textAlign: "right", wordBreak: "break-all" }}>{value}</p>
    </div>
  );
}

function CountList({ rows, badgeClass, label, empty }: {
  rows: [string, number][];
  badgeClass: (status: string) => string;
  label: (status: string) => string;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{empty}</p>;
  }
  return (
    <div className="list-card">
      {rows.map(([status, count]) => (
        <div key={status} className="list-row" style={{ justifyContent: "space-between", cursor: "default" }}>
          <span className={badgeClass(status)}>{label(status)}</span>
          <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

export function OrganizationDetail() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();
  const { data: org, isLoading, error } = useAdminOrganization(id);

  if (!user?.is_platform_admin) {
    return <Navigate to="/more" replace />;
  }

  const header = (
    <button className="back-btn" onClick={() => navigate("/admin/organizations")} style={{ marginBottom: 8 }}>
      <BackIcon /> Organizations
    </button>
  );

  if (isLoading || !org) {
    return (
      <div className="animate-in">
        <div className="page-header">{header}</div>
        <div className="page-body">
          <p style={{ fontSize: 13, color: error ? "var(--red-text)" : "var(--text-tertiary)" }}>
            {error ? (error instanceof Error ? error.message : "Failed to load organization") : "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  const itemRows = orderedCounts(org.items_by_status, ITEM_STATUS_ORDER);
  const jobRows = orderedCounts(org.jobs_by_status, JOB_STATUS_ORDER);
  const activeUsers = org.users.filter((u) => u.is_active).length;

  return (
    <div className="animate-in">
      <div className="page-header">
        {header}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 className="page-title">{org.name}</h1>
          <span className={`badge ${org.is_active ? "badge-green" : "badge-gray"}`}>
            {org.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="page-subtitle">{org.slug}</p>
      </div>

      <div className="page-body">
        <button
          className="btn btn-outline"
          style={{ fontSize: 12.5, padding: "8px 14px", marginBottom: 16 }}
          onClick={() => navigate(`/admin/items?org=${org.id}`)}
        >
          View this org's furniture
        </button>

        <p style={labelStyle}>Organization</p>
        <div className="list-card" style={{ marginBottom: 20 }}>
          <InfoRow label="Invite code" value={org.invite_code} />
          <InfoRow label="Created" value={formatDate(org.created_at)} />
          <InfoRow label="Last activity" value={org.last_activity_at ? formatDate(org.last_activity_at) : "None"} />
        </div>

        <div className="pair-grid" style={{ marginBottom: 20, maxWidth: "none" }}>
          <div>
            <p style={labelStyle}>Items</p>
            <CountList
              rows={itemRows}
              badgeClass={(s) => statusBadgeClass(s)}
              label={(s) => statusLabel(s)}
              empty="No items"
            />
          </div>
          <div>
            <p style={labelStyle}>Jobs</p>
            <CountList
              rows={jobRows}
              badgeClass={jobStatusBadgeClass}
              label={(s) => s.charAt(0).toUpperCase() + s.slice(1)}
              empty="No jobs"
            />
          </div>
        </div>

        <p style={labelStyle}>Users · {activeUsers} active of {org.users.length}</p>
        {org.users.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No users</p>
        ) : (
          <div className="list-card">
            {org.users.map((u) => (
              <div
                key={u.id}
                className="list-row"
                style={{ justifyContent: "space-between", cursor: "default", opacity: u.is_active ? 1 : 0.6 }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 500 }}>{u.name}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{u.email}</p>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <span className={`badge ${u.role === "manager" ? "badge-blue" : "badge-gray"}`}>{u.role}</span>
                  {!u.is_active && <span className="badge badge-red">Deactivated</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
