import { useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { TabBar } from "./TabBar";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";

/**
 * Where a platform admin lands instead of an org-only screen. Their own org has
 * no furniture or jobs, so these pages would only ever be empty.
 */
export function adminRedirectFor(pathname: string): string | null {
  if (pathname === "/inventory" || pathname.startsWith("/inventory/")) return "/admin/items";
  if (pathname === "/jobs" || pathname.startsWith("/jobs/")) return "/admin/jobs";
  const orgOnly = ["/scan", "/sets", "/labels", "/reports", "/users", "/schedule"];
  if (orgOnly.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "/home";
  return null;
}

function ActingBanner() {
  const { user, exitOrg } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!user?.acting_org) return null;

  async function exit() {
    const org = user!.acting_org!;
    setBusy(true);
    try {
      await exitOrg();
      navigate(`/admin/organizations/${org.id}`);
    } catch {
      showToast("Couldn't switch back — try signing out and in", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "8px 16px", paddingTop: "calc(8px + var(--safe-top))",
        background: "rgba(245,158,11,0.14)", borderBottom: "1px solid rgba(245,158,11,0.35)",
        fontSize: 12.5, color: "var(--amber-text)",
      }}
    >
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Admin · working inside <strong>{user.acting_org.name}</strong>
      </span>
      <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 10px", flexShrink: 0 }} disabled={busy} onClick={exit}>
        {busy ? "Exiting…" : "Exit org"}
      </button>
    </div>
  );
}

export function AppShell() {
  const { isAdminMode } = useAuth();
  const location = useLocation();

  const redirect = isAdminMode ? adminRedirectFor(location.pathname) : null;
  if (redirect) return <Navigate to={redirect} replace />;

  return (
    <div className="app-shell">
      <TabBar />
      <div className="page-scroll">
        <ActingBanner />
        <div className="page-scroll-inner">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
