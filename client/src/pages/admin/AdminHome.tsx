import { useNavigate } from "react-router-dom";
import { useAdminOrganizations } from "../../lib/queries";

const labelStyle = {
  fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
  textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: 6,
};

/**
 * Home for platform admins. Their own org has no furniture, so instead of an
 * all-zero dashboard they get platform-wide totals and the way into each org.
 * No customer's furniture is listed here; that's one tap away under "All furniture".
 */
export function AdminHome({ greeting, name }: { greeting: string; name: string }) {
  const navigate = useNavigate();
  const { data: orgs = [], isLoading } = useAdminOrganizations();

  const activeOrgs = orgs.filter((o) => o.is_active);
  const statCards = [
    { label: "Organizations", value: activeOrgs.length, sub: `${orgs.length - activeOrgs.length} inactive`, color: "var(--accent)", route: "/admin/organizations" },
    { label: "Users",         value: orgs.reduce((n, o) => n + o.user_count, 0), sub: "across all orgs", route: "/admin/organizations" },
    { label: "Furniture",     value: orgs.reduce((n, o) => n + o.item_count, 0), sub: "items tracked", route: "/admin/items" },
    { label: "Active jobs",   value: orgs.reduce((n, o) => n + o.active_job_count, 0), sub: "houses staged now", color: "var(--green-text)", route: "/admin/jobs" },
  ];

  return (
    <div className="animate-in">
      <div className="page-header" style={{ paddingTop: "calc(20px + var(--safe-top))" }}>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 2 }}>{greeting},</p>
        <h1 className="page-title">{name}</h1>
        <p className="page-subtitle">Platform admin · not tied to any organization</p>
      </div>

      <div className="page-body">
        <div className="stat-grid">
          {statCards.map((card) => (
            <div key={card.label} className="card" style={{ cursor: "pointer", padding: 14 }} onClick={() => navigate(card.route)}>
              <p style={labelStyle}>{card.label}</p>
              <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px", color: card.color, marginBottom: 2 }}>
                {isLoading ? "—" : card.value.toLocaleString()}
              </p>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{isLoading ? "" : card.sub}</p>
            </div>
          ))}
        </div>

        <p style={{ ...labelStyle, marginBottom: 8 }}>Organizations</p>
        {orgs.length === 0 && !isLoading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No organizations yet.</p>
        ) : (
          <div className="list-card">
            {[...orgs]
              .sort((a, b) => b.active_job_count - a.active_job_count || b.item_count - a.item_count)
              .slice(0, 6)
              .map((o) => (
                <div key={o.id} className="list-row" style={{ justifyContent: "space-between", opacity: o.is_active ? 1 : 0.6 }}
                  onClick={() => navigate(`/admin/organizations/${o.id}`)}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 500 }}>{o.name}</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                      {o.item_count} items · {o.active_job_count} active job{o.active_job_count === 1 ? "" : "s"} · {o.user_count} user{o.user_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {!o.is_active && <span className="badge badge-gray">Inactive</span>}
                </div>
              ))}
          </div>
        )}
        {orgs.length > 6 && (
          <button className="btn btn-outline btn-full" style={{ marginTop: 10 }} onClick={() => navigate("/admin/organizations")}>
            See all {orgs.length} organizations
          </button>
        )}
      </div>
    </div>
  );
}
