import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useUtilizationReport,
  useJobPerformanceReport,
  useInventoryValueReport,
  useDamageLossReport,
} from "../lib/queries";
import { getCategoryEmoji } from "../lib/utils";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number) {
  return `${n}%`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleString("default", { month: "short" });
}

// Simple horizontal bar
function Bar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--bg-surface)", overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          borderRadius: 3,
          background: color,
          width: `${Math.min(100, pct)}%`,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

// Skeleton block
function Skel({ w = "100%", h = 13 }: { w?: string | number; h?: number }) {
  return (
    <div style={{ height: h, borderRadius: 4, background: "var(--bg-surface)", width: w }} />
  );
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: accent ? "var(--accent)" : undefined, marginBottom: sub ? 2 : 0 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{sub}</p>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 8 }}>
      {title}
    </p>
  );
}

// ─── Tab: Utilization ─────────────────────────────────────────────────────────

function UtilizationTab() {
  const { data, isLoading } = useUtilizationReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Skel h={80} /><Skel h={80} />
        </div>
        {[...Array(4)].map((_, i) => <Skel key={i} h={48} />)}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Overall */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Overall utilization" value={fmtPct(data.overall_pct)} accent />
        <StatCard label="Dead stock" value={String(data.dead_stock.length)} sub="never staged" />
      </div>

      {/* By category */}
      <div>
        <SectionHeader title="By category" />
        <div className="card" style={{ padding: "4px 0" }}>
          {data.by_category.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: "16px", textAlign: "center" }}>No data yet</p>
          ) : (
            data.by_category.map((row) => (
              <div key={row.category} style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {getCategoryEmoji(row.category)} {row.category}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {row.staged}/{row.total} · {fmtPct(row.utilization_pct)}
                  </span>
                </div>
                <Bar pct={row.utilization_pct} />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top items */}
      {data.top_items.length > 0 && (
        <div>
          <SectionHeader title="Most-used items" />
          <div className="list-card">
            {data.top_items.map((item, i) => (
              <div key={item.id} className="list-row">
                <span style={{ fontSize: 13, color: "var(--text-tertiary)", width: 18, flexShrink: 0 }}>#{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.category}</p>
                </div>
                <span className="badge badge-blue">{item.job_count} job{item.job_count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dead stock list */}
      {data.dead_stock.length > 0 && (
        <div>
          <SectionHeader title="Dead stock — never staged" />
          <div className="list-card">
            {data.dead_stock.slice(0, 8).map((item) => (
              <div key={item.id} className="list-row">
                <span style={{ fontSize: 18 }}>{getCategoryEmoji(item.category)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{item.sku}</p>
                </div>
              </div>
            ))}
            {data.dead_stock.length > 8 && (
              <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-tertiary)", textAlign: "center" }}>
                +{data.dead_stock.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Job Performance ─────────────────────────────────────────────────────

function JobPerformanceTab() {
  const { data, isLoading } = useJobPerformanceReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Skel h={80} /><Skel h={80} />
        </div>
        <Skel h={80} />
        <Skel h={120} />
      </div>
    );
  }

  if (!data) return null;

  const maxMonth = Math.max(...data.monthly_completions.map((m) => m.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Jobs completed" value={String(data.total_completed)} />
        <StatCard label="Avg duration" value={data.avg_duration_days > 0 ? `${data.avg_duration_days}d` : "—"} sub="start to close" />
        <StatCard label="On-time rate" value={data.total_completed > 0 ? fmtPct(data.on_time_rate_pct) : "—"} accent />
        <StatCard label="Damage rate" value={data.total_completed > 0 ? fmtPct(data.damage_rate_pct) : "—"} sub="jobs w/ damage" />
      </div>

      {/* Monthly completions bar chart */}
      <div>
        <SectionHeader title="Completions — last 6 months" />
        <div className="card" style={{ padding: "14px 14px 8px" }}>
          {data.monthly_completions.every((m) => m.count === 0) ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "8px 0" }}>No completed jobs yet</p>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {data.monthly_completions.map((m) => (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600 }}>{m.count || ""}</span>
                  <div
                    style={{
                      width: "100%",
                      borderRadius: "3px 3px 0 0",
                      background: "var(--accent)",
                      opacity: 0.85,
                      height: `${Math.max(4, (m.count / maxMonth) * 56)}px`,
                      transition: "height 0.4s ease",
                    }}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top clients */}
      {data.top_clients.length > 0 && (
        <div>
          <SectionHeader title="Top clients" />
          <div className="card" style={{ padding: "4px 0" }}>
            {data.top_clients.map((c, i) => {
              const maxJobs = data.top_clients[0].job_count;
              return (
                <div key={c.client_name} style={{ padding: "10px 14px", borderBottom: i < data.top_clients.length - 1 ? "1px solid var(--border)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{c.client_name}</span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{c.job_count} job{c.job_count !== 1 ? "s" : ""}</span>
                  </div>
                  <Bar pct={(c.job_count / maxJobs) * 100} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Inventory Value ─────────────────────────────────────────────────────

function InventoryValueTab() {
  const { data, isLoading } = useInventoryValueReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Skel h={90} />
        <Skel h={60} />
        {[...Array(4)].map((_, i) => <Skel key={i} h={48} />)}
      </div>
    );
  }

  if (!data) return null;

  const maxCatValue = Math.max(...data.by_category.map((c) => c.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Total */}
      <div className="card" style={{ padding: 16 }}>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Total inventory value</p>
        <p style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-1px", marginBottom: 8 }}>{fmt$(data.total_value)}</p>
        {/* Available vs Staged split bar */}
        <div style={{ height: 8, borderRadius: 4, background: "var(--bg-surface)", overflow: "hidden", display: "flex", marginBottom: 8 }}>
          {data.total_value > 0 && (
            <>
              <div style={{ width: `${(data.available_value / data.total_value) * 100}%`, background: "var(--green)", transition: "width 0.4s" }} />
              <div style={{ width: `${(data.staged_value / data.total_value) * 100}%`, background: "var(--accent)", transition: "width 0.4s" }} />
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--green)", display: "inline-block" }} />
            Available {fmt$(data.available_value)}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)", display: "inline-block" }} />
            Staged {fmt$(data.staged_value)}
          </span>
        </div>
      </div>

      {/* Disposed / lost */}
      {data.disposed_count > 0 && (
        <div className="card" style={{ padding: 14, borderColor: "rgba(239,68,68,0.2)" }}>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Written off (disposed)</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "var(--red-text)", letterSpacing: "-0.5px" }}>{fmt$(data.disposed_value)}</p>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{data.disposed_count} item{data.disposed_count !== 1 ? "s" : ""}</p>
        </div>
      )}

      {/* By category */}
      <div>
        <SectionHeader title="Value by category" />
        <div className="card" style={{ padding: "4px 0" }}>
          {data.by_category.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: 16, textAlign: "center" }}>No data yet</p>
          ) : (
            data.by_category.map((row, i) => (
              <div key={row.category} style={{ padding: "10px 14px", borderBottom: i < data.by_category.length - 1 ? "1px solid var(--border)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {getCategoryEmoji(row.category)} {row.category}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {fmt$(row.value)} · {row.count} item{row.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <Bar pct={(row.value / maxCatValue) * 100} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Damage & Loss ───────────────────────────────────────────────────────

const conditionColors: Record<string, string> = {
  damaged: "badge-amber",
  dispose: "badge-red",
};

function DamageLossTab() {
  const { data, isLoading } = useDamageLossReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Skel h={80} /><Skel h={80} />
        </div>
        {[...Array(4)].map((_, i) => <Skel key={i} h={48} />)}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Damage events" value={String(data.total_damage_events)} sub="across all jobs" />
        <StatCard label="Items disposed" value={String(data.total_disposed_count)} sub={data.total_disposed_value > 0 ? fmt$(data.total_disposed_value) + " lost" : undefined} />
      </div>

      {/* Top damaged items */}
      {data.top_damaged_items.length > 0 && (
        <div>
          <SectionHeader title="Most frequently damaged" />
          <div className="list-card">
            {data.top_damaged_items.map((item, i) => (
              <div key={item.id} className="list-row">
                <span style={{ fontSize: 13, color: "var(--text-tertiary)", width: 18, flexShrink: 0 }}>#{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.category} · {item.sku}</p>
                </div>
                <span className="badge badge-red">{item.damage_count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent events */}
      {data.recent_events.length > 0 ? (
        <div>
          <SectionHeader title="Recent damage events" />
          <div className="list-card">
            {data.recent_events.map((ev, i) => (
              <div key={i} style={{ padding: "10px 14px", borderBottom: i < data.recent_events.length - 1 ? "1px solid var(--border)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.item_name}</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.job_address} · {ev.job_client}
                    </p>
                    {ev.notes && (
                      <p style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2, fontStyle: "italic" }}>{ev.notes}</p>
                    )}
                  </div>
                  <span className={`badge ${conditionColors[ev.condition ?? "damaged"] ?? "badge-amber"}`} style={{ flexShrink: 0 }}>
                    {ev.condition === "dispose" ? "Disposed" : "Damaged"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "32px 16px", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No damage events recorded yet.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Reports page ────────────────────────────────────────────────────────

type Tab = "utilization" | "performance" | "value" | "damage";

const TABS: { key: Tab; label: string }[] = [
  { key: "utilization", label: "Utilization" },
  { key: "performance", label: "Jobs" },
  { key: "value",       label: "Value" },
  { key: "damage",      label: "Damage" },
];

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function Reports() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("utilization");

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/more")} style={{ marginBottom: 8 }}>
          <BackIcon /> More
        </button>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Inventory analytics</p>
      </div>

      <div style={{ padding: "0 18px" }}>
        {/* Tab strip */}
        <div className="chip-row" style={{ marginBottom: 16 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`chip${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ paddingBottom: 32 }}>
          {tab === "utilization" && <UtilizationTab />}
          {tab === "performance" && <JobPerformanceTab />}
          {tab === "value"       && <InventoryValueTab />}
          {tab === "damage"      && <DamageLossTab />}
        </div>
      </div>
    </div>
  );
}
