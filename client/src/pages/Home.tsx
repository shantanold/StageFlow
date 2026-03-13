import { useAuth } from "../contexts/AuthContext";

export function Home() {
  const { user, logout } = useAuth();

  return (
    <div>
      <div className="page-header" style={{ paddingTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 2 }}>
              Good morning,
            </p>
            <h1 className="page-title">{user?.name}</h1>
          </div>
          <button
            onClick={logout}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-tertiary)",
              fontSize: 12,
              padding: "5px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Placeholder stat grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Available", value: "—", color: "var(--green-text)" },
            { label: "Staged", value: "—", color: "#60a5fa" },
            { label: "Active Jobs", value: "—", color: "var(--text-primary)" },
            { label: "Needs Attention", value: "—", color: "var(--amber-text)" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: 14,
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                {s.label}
              </p>
              <p style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.5px", color: s.color }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Upcoming returns placeholder */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span className="section-title">Upcoming Returns</span>
        </div>
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "28px 16px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Dashboard data loads in Phase 6.
          </p>
        </div>
      </div>
    </div>
  );
}
