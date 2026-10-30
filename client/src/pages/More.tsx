import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard, useItems } from "../lib/queries";
import { unpricedItems } from "../lib/utils";

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface MenuItem {
  label: string;
  description?: string;
  route?: string;
  onClick?: () => void;
  badge?: string;
  badgeClass?: string;
  disabled?: boolean;
}

export function More() {
  const { user, logout, isAdminMode, exitOrg } = useAuth();
  const navigate = useNavigate();
  const { data: stats } = useDashboard();
  const canPrice = user?.role === "manager" && !isAdminMode;
  const { data: catalog } = useItems({}, { enabled: canPrice });
  const unpricedCount = unpricedItems(catalog ?? []).length;

  // Platform admins outside any org: only cross-org tools; the org screens below would be empty.
  const adminItems: MenuItem[] = [
    { label: "Organizations", description: "Create, rename, deactivate, manage users, enter an org", route: "/admin/organizations", badge: "Admin" },
    { label: "All Furniture", description: "Inventory across every org, with status and condition edits", route: "/admin/items", badge: "Admin" },
    { label: "All Jobs", description: "Jobs across every org", route: "/admin/jobs", badge: "Admin" },
  ];

  const orgItems: MenuItem[] = [
    {
      label: "Schedule",
      description: "Appointments, installs & pickups; import Google or Apple calendars",
      route: "/schedule",
    },
    {
      label: "Sets",
      description: "Manage furniture set groupings",
      route: "/sets",
    },
    ...(canPrice
      ? [{
          label: "Price Items",
          description: unpricedCount > 0
            ? `${unpricedCount} item${unpricedCount === 1 ? "" : "s"} still at $0`
            : "Set a cost on pieces still at $0",
          route: "/price",
          badge: unpricedCount > 0 ? String(unpricedCount) : undefined,
          badgeClass: "badge badge-amber",
        }]
      : []),
    ...(user?.role === "manager"
      ? [{
          label: "Prep Labels",
          description: "Create blank QR stickers to print before a job",
          route: "/labels/prep",
        }]
      : []),
    {
      label: "Print QR Labels",
      description: "Generate printable label sheets",
      route: "/labels",
    },
    {
      label: "Reports",
      description: "Utilization, performance, value & damage",
      route: "/reports",
    },
    ...(user?.role === "manager"
      ? [{ label: "Users", description: "Manage roles & access", route: "/users" }]
      : []),
    ...(user?.acting_org
      ? [{
          label: `Exit ${user.acting_org.name}`,
          description: "Back to the platform admin view",
          badge: "Admin",
          onClick: () => { void exitOrg().then(() => navigate("/home")); },
        }]
      : []),
  ];

  const menuItems = isAdminMode ? adminItems : orgItems;

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">More</h1>
      </div>

      <div className="page-body">
        {/* Account card */}
        <div
          className="card"
          style={{ marginBottom: 16 }}
        >
          <p
            style={{
              fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
              textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10,
            }}
          >
            Account
          </p>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 2 }}>{user?.name}</p>
          <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 8 }}>
            {user?.email}
          </p>
          {isAdminMode ? (
            <span className="badge badge-amber">platform admin</span>
          ) : (
            <span className={`badge ${user?.role === "manager" ? "badge-blue" : "badge-gray"}`}>
              {user?.role}
            </span>
          )}
        </div>

        {!isAdminMode && (
          <>
        {/* Quick stats */}
        <p
          style={{
            fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
            textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8,
          }}
        >
          Quick stats
        </p>
        <div className="pair-grid" style={{ marginBottom: 16 }}>
          <div className="card" style={{ padding: 14 }}>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Utilization</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: "var(--accent)", letterSpacing: "-0.5px", marginBottom: 2 }}>
              {stats ? `${stats.utilization_pct}%` : "—"}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>items staged</p>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Inventory value</p>
            <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 2 }}>
              {stats
                ? `$${Math.round(stats.total_inventory_value).toLocaleString()}`
                : "—"}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              {stats ? `${stats.total_items} active items` : ""}
            </p>
          </div>
        </div>
          </>
        )}

        {/* Navigation */}
        <div className="list-card" style={{ marginBottom: 12 }}>
          {menuItems.map((item) => (
            <div
              key={item.label}
              className="list-row"
              style={{
                justifyContent: "space-between",
                opacity: item.disabled ? 0.5 : 1,
                cursor: item.disabled ? "default" : "pointer",
              }}
              onClick={() => {
                if (item.disabled) return;
                if (item.route) navigate(item.route);
                if (item.onClick) item.onClick();
              }}
            >
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 500 }}>{item.label}</p>
                {item.description && (
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 1 }}>
                    {item.description}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {item.badge && (
                  <span className={item.badgeClass ?? "badge badge-gray"} style={{ fontSize: 10 }}>
                    {item.badge}
                  </span>
                )}
                {!item.disabled && (
                  <span style={{ color: "var(--text-tertiary)" }}>
                    <ChevronRightIcon />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-outline btn-full" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
