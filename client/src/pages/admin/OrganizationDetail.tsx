import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import {
  useAdminOrganization, useAdminOrganizations, useAdminUpdateUser,
  useRegenerateInviteCode, useUpdateOrganization,
} from "../../lib/queries";
import { ApiError } from "../../lib/api";
import { formatDate, jobStatusBadgeClass, statusBadgeClass, statusLabel } from "../../lib/utils";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ModalOverlay } from "../../components/ModalOverlay";
import type { AdminOrganizationDetail, ManagedUser } from "../../types";

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

const smallBtn = { fontSize: 11, padding: "6px 10px" };

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

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

// ─── Org settings ────────────────────────────────────────────────────────────

function RenameModal({ org, onClose }: { org: AdminOrganizationDetail; onClose: () => void }) {
  const { showToast } = useToast();
  const update = useUpdateOrganization(org.id);
  const [name, setName] = useState(org.name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({ name });
      showToast("Organization renamed", "success");
      onClose();
    } catch (err) {
      showToast(errorText(err, "Failed to rename"), "error");
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 16 }}>Rename organization</div>
        <form onSubmit={submit}>
          <label className="form-label">Name</label>
          <input className="input-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={name.trim().length < 2 || update.isPending}>
              Save
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function OrgActions({ org }: { org: AdminOrganizationDetail }) {
  const { enterOrg } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const update = useUpdateOrganization(org.id);
  const regenerate = useRegenerateInviteCode(org.id);
  const [dialog, setDialog] = useState<"rename" | "toggle" | "invite" | null>(null);
  const [entering, setEntering] = useState(false);

  async function enter() {
    setEntering(true);
    try {
      await enterOrg(org.id);
      navigate("/home");
    } catch (err) {
      showToast(errorText(err, "Couldn't enter this organization"), "error");
      setEntering(false);
    }
  }

  async function toggleActive() {
    try {
      await update.mutateAsync({ is_active: !org.is_active });
      showToast(org.is_active ? `${org.name} deactivated` : `${org.name} reactivated`, "success");
    } catch (err) {
      showToast(errorText(err, "Failed to update"), "error");
    }
    setDialog(null);
  }

  async function newInviteCode() {
    try {
      await regenerate.mutateAsync();
      showToast("New invite code created", "success");
    } catch (err) {
      showToast(errorText(err, "Failed to create a new code"), "error");
    }
    setDialog(null);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <button className="btn btn-primary" style={{ fontSize: 12.5, padding: "8px 14px" }} disabled={entering} onClick={enter}>
          {entering ? "Entering…" : "Enter org"}
        </button>
        <button className="btn btn-outline" style={{ fontSize: 12.5, padding: "8px 14px" }} onClick={() => navigate(`/admin/items?org=${org.id}`)}>
          Furniture
        </button>
        <button className="btn btn-outline" style={{ fontSize: 12.5, padding: "8px 14px" }} onClick={() => navigate(`/admin/jobs?org=${org.id}`)}>
          Jobs
        </button>
        <button className="btn btn-outline" style={{ fontSize: 12.5, padding: "8px 14px" }} onClick={() => setDialog("rename")}>
          Rename
        </button>
        <button className="btn btn-outline" style={{ fontSize: 12.5, padding: "8px 14px" }} onClick={() => setDialog("invite")}>
          New invite code
        </button>
        <button
          className="btn btn-outline"
          style={{
            fontSize: 12.5, padding: "8px 14px",
            borderColor: org.is_active ? "rgba(239,68,68,0.4)" : undefined,
            color: org.is_active ? "var(--red-text)" : undefined,
          }}
          onClick={() => (org.is_active ? setDialog("toggle") : toggleActive())}
        >
          {org.is_active ? "Deactivate" : "Reactivate"}
        </button>
      </div>

      {dialog === "rename" && <RenameModal org={org} onClose={() => setDialog(null)} />}
      {dialog === "toggle" && (
        <ConfirmDialog
          title={`Deactivate ${org.name}?`}
          message="New sign-ups with its invite code will be refused. Existing users, furniture and jobs aren't touched, and you can reactivate any time."
          confirmLabel="Deactivate"
          confirmDanger
          onConfirm={toggleActive}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "invite" && (
        <ConfirmDialog
          title="Create a new invite code?"
          message={`The current code (${org.invite_code}) will stop working right away. People already signed up aren't affected.`}
          confirmLabel="New code"
          onConfirm={newInviteCode}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}

// ─── Users ───────────────────────────────────────────────────────────────────

function MoveUserModal({ user, currentOrgId, onClose }: { user: ManagedUser; currentOrgId: string; onClose: () => void }) {
  const { showToast } = useToast();
  const { data: orgs = [] } = useAdminOrganizations();
  const updateUser = useAdminUpdateUser(user.id);
  const others = orgs
    .filter((o) => o.id !== currentOrgId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const [orgId, setOrgId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateUser.mutateAsync({ org_id: orgId });
      showToast(`${user.name} moved to ${others.find((o) => o.id === orgId)?.name}`, "success");
      onClose();
    } catch (err) {
      showToast(errorText(err, "Failed to move user"), "error");
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 6 }}>Move {user.name}</div>
        <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 16 }}>
          They'll see the new org's furniture and jobs the next time they sign in. Jobs and scans they already recorded stay here.
        </p>
        <form onSubmit={submit}>
          <label className="form-label">Move to</label>
          <select className="input-field" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">Choose an organization…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>{o.name}{o.is_active ? "" : " (inactive)"}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={!orgId || updateUser.isPending}>
              Move
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

function OrgUserRow({ user, orgId }: { user: ManagedUser; orgId: string }) {
  const { showToast } = useToast();
  const updateUser = useAdminUpdateUser(user.id);
  const [dialog, setDialog] = useState<"deactivate" | "move" | null>(null);

  async function change(data: { role?: "staff" | "manager"; is_active?: boolean }, done: string) {
    try {
      await updateUser.mutateAsync(data);
      showToast(done, "success");
    } catch (err) {
      showToast(errorText(err, "Failed to update user"), "error");
    }
    setDialog(null);
  }

  const nextRole = user.role === "manager" ? "staff" : "manager";

  return (
    <div className="list-row" style={{ justifyContent: "space-between", cursor: "default", opacity: user.is_active ? 1 : 0.6, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 180px" }}>
        <p style={{ fontSize: 13.5, fontWeight: 500 }}>{user.name}</p>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, wordBreak: "break-all" }}>{user.email}</p>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <span className={`badge ${user.role === "manager" ? "badge-blue" : "badge-gray"}`}>{user.role}</span>
          {!user.is_active && <span className="badge badge-red">Deactivated</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
        <button className="btn btn-outline" style={smallBtn} disabled={updateUser.isPending}
          onClick={() => change({ role: nextRole }, `${user.name} is now ${nextRole}`)}>
          Make {nextRole}
        </button>
        <button className="btn btn-outline" style={smallBtn} disabled={updateUser.isPending} onClick={() => setDialog("move")}>
          Move
        </button>
        <button
          className="btn btn-outline"
          style={{ ...smallBtn, borderColor: user.is_active ? "rgba(239,68,68,0.4)" : undefined, color: user.is_active ? "var(--red-text)" : undefined }}
          disabled={updateUser.isPending}
          onClick={() => (user.is_active ? setDialog("deactivate") : change({ is_active: true }, `${user.name} reactivated`))}
        >
          {user.is_active ? "Deactivate" : "Reactivate"}
        </button>
      </div>

      {dialog === "deactivate" && (
        <ConfirmDialog
          title={`Deactivate ${user.name}?`}
          message="They won't be able to sign in until reactivated. Nothing they've recorded is touched."
          confirmLabel="Deactivate"
          confirmDanger
          onConfirm={() => change({ is_active: false }, `${user.name} deactivated`)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "move" && <MoveUserModal user={user} currentOrgId={orgId} onClose={() => setDialog(null)} />}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

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
        <OrgActions org={org} />

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
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No users yet. Share the invite code to add some.</p>
        ) : (
          <div className="list-card">
            {org.users.map((u) => (
              <OrgUserRow key={u.id} user={u} orgId={org.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
