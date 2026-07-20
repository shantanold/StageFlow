import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useUsers, useUpdateUserAccess } from "../lib/queries";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ApiError } from "../lib/api";
import type { ManagedUser } from "../types";

function UserRow({ managedUser, isSelf }: { managedUser: ManagedUser; isSelf: boolean }) {
  const { showToast } = useToast();
  const updateAccess = useUpdateUserAccess(managedUser.id);
  const [showDeactivate, setShowDeactivate] = useState(false);

  async function toggleRole() {
    const nextRole = managedUser.role === "manager" ? "staff" : "manager";
    try {
      await updateAccess.mutateAsync({ role: nextRole });
      showToast(`${managedUser.name} is now ${nextRole}`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update role", "error");
    }
  }

  async function toggleActive() {
    try {
      await updateAccess.mutateAsync({ is_active: !managedUser.is_active });
      showToast(managedUser.is_active ? `${managedUser.name} deactivated` : `${managedUser.name} reactivated`, "success");
      setShowDeactivate(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to update access", "error");
    }
  }

  return (
    <div className="list-row" style={{ justifyContent: "space-between", opacity: managedUser.is_active ? 1 : 0.6 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {managedUser.name} {isSelf && <span style={{ color: "var(--text-tertiary)" }}>(you)</span>}
        </p>
        <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{managedUser.email}</p>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <span className={`badge ${managedUser.role === "manager" ? "badge-blue" : "badge-gray"}`}>
            {managedUser.role}
          </span>
          {!managedUser.is_active && <span className="badge badge-red">Deactivated</span>}
        </div>
      </div>

      {!isSelf && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <button
            className="btn btn-outline"
            style={{ fontSize: 11, padding: "6px 10px" }}
            disabled={updateAccess.isPending}
            onClick={toggleRole}
          >
            Make {managedUser.role === "manager" ? "staff" : "manager"}
          </button>
          <button
            className="btn btn-outline"
            style={{
              fontSize: 11, padding: "6px 10px",
              borderColor: managedUser.is_active ? "rgba(239,68,68,0.4)" : undefined,
              color: managedUser.is_active ? "var(--red-text)" : undefined,
            }}
            disabled={updateAccess.isPending}
            onClick={() => (managedUser.is_active ? setShowDeactivate(true) : toggleActive())}
          >
            {managedUser.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      )}

      {showDeactivate && (
        <ConfirmDialog
          title={`Deactivate ${managedUser.name}?`}
          message="They won't be able to sign in until reactivated. This doesn't touch anything they've already scanned or created."
          confirmLabel="Deactivate"
          confirmDanger
          onConfirm={toggleActive}
          onCancel={() => setShowDeactivate(false)}
        />
      )}
    </div>
  );
}

export function Users() {
  const { user } = useAuth();
  const { data: users = [], isLoading } = useUsers();

  if (user?.role !== "manager") {
    return <Navigate to="/more" replace />;
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">{users.length} accounts</p>
      </div>

      <div style={{ padding: "0 18px" }}>
        {isLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading…</p>
        ) : (
          <div className="list-card">
            {users.map((u) => (
              <UserRow key={u.id} managedUser={u} isSelf={u.id === user.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
