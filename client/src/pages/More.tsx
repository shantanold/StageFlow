import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard } from "../lib/queries";

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
  disabled?: boolean;
}

export function More() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: stats } = useDashboard();

  const menuItems: MenuItem[] = [
    {
      label: "Sets",
      description: "Manage furniture set groupings",
      route: "/sets",
    },
    {
      label: "Print QR Labels",
      description: "Generate printable label sheets",
      route: "/labels",
    },
    {
      label: "Reports",
      description: "Utilization and activity reports",
      disabled: true,
      badge: "Phase 6",
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">More</h1>
      </div>

      <div style={{ padding: "0 18px" }}>
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
          <span className={`badge ${user?.role === "manager" ? "badge-blue" : "badge-gray"}`}>
            {user?.role}
          </span>
        </div>

        {/* Quick stats */}
        <p
          style={{
            fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
            textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8,
          }}
        >
          Quick stats
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
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
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>
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
