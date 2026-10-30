import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useUtilizationReport,
  useJobPerformanceReport,
  useInventoryValueReport,
  useDamageLossReport,
  useRevenueReport,
  useDemandReport,
  useActivityReport,
} from "../lib/queries";
import { getCategoryEmoji, statusBadgeClass, statusLabel } from "../lib/utils";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmt$Full(n: number) {
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number) {
  return `${n}%`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleString("default", { month: "short" });
}

function weekdayLabel(n: number) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][n] ?? "";
}

function formatHeatDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
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
          width: `${Math.min(100, Math.max(0, pct))}%`,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

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

function VerticalBars({
  items,
  valueKey,
  emptyLabel,
}: {
  items: { month: string; [k: string]: number | string }[];
  valueKey: string;
  emptyLabel: string;
}) {
  const max = Math.max(...items.map((m) => Number(m[valueKey]) || 0), 1);
  const allZero = items.every((m) => !(Number(m[valueKey]) > 0));
  if (allZero) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", padding: "8px 0" }}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 96 }}>
      {items.map((m) => {
        const v = Number(m[valueKey]) || 0;
        return (
          <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 9, color: "var(--text-tertiary)", fontWeight: 600, whiteSpace: "nowrap" }}>
              {v > 0 ? (valueKey === "revenue" || valueKey === "extensions" ? fmt$(v) : v) : ""}
            </span>
            <div
              style={{
                width: "100%",
                borderRadius: "3px 3px 0 0",
                background: "var(--accent)",
                opacity: 0.85,
                height: `${Math.max(4, (v / max) * 64)}px`,
                transition: "height 0.4s ease",
              }}
            />
            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{monthLabel(String(m.month))}</span>
          </div>
        );
      })}
    </div>
  );
}

const CAT_COLORS = [
  "var(--accent)",
  "#0d9488",
  "#d97706",
  "#7c3aed",
  "#db2777",
];

// ─── Tab: Revenue ─────────────────────────────────────────────────────────────

function RevenueTab() {
  const { data, isLoading } = useRevenueReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Skel h={80} /><Skel h={80} /><Skel h={80} /><Skel h={80} />
        </div>
        <Skel h={120} />
        <Skel h={160} />
      </div>
    );
  }
  if (!data) return null;

  const maxClient = Math.max(...data.top_clients.map((c) => c.revenue), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Collected revenue" value={fmt$Full(data.collected_revenue)} sub="completed jobs" accent />
        <StatCard label="Pipeline" value={fmt$Full(data.pipeline_revenue)} sub="active + planning" />
        <StatCard label="Avg staging amount" value={data.avg_amount > 0 ? fmt$Full(data.avg_amount) : "—"} sub={data.avg_monthly_rate > 0 ? `${fmt$(data.avg_monthly_rate)}/mo avg` : undefined} />
        <StatCard label="Extensions" value={fmt$Full(data.extension_revenue)} sub="extension fees" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard
          label="Market value staged"
          value={data.market_value_staged > 0 ? fmt$(data.market_value_staged) : "—"}
          sub="homes currently staged"
        />
        <StatCard
          label="Market value all-time"
          value={data.market_value_all_time > 0 ? fmt$(data.market_value_all_time) : "—"}
          sub={`${data.jobs_with_market_value}/${data.job_count} jobs tracked`}
        />
      </div>

      <div>
        <SectionHeader title="Revenue — last 12 months" />
        <div className="card" style={{ padding: "14px 14px 8px" }}>
          <VerticalBars items={data.monthly} valueKey="revenue" emptyLabel="No revenue recorded yet — add Amount / Total paid on jobs" />
        </div>
      </div>

      {data.monthly.some((m) => m.extensions > 0) && (
        <div>
          <SectionHeader title="Extension fees by month" />
          <div className="card" style={{ padding: "14px 14px 8px" }}>
            <VerticalBars items={data.monthly} valueKey="extensions" emptyLabel="No extensions yet" />
          </div>
        </div>
      )}

      {data.top_clients.length > 0 && (
        <div>
          <SectionHeader title="Top clients by revenue" />
          <div className="card" style={{ padding: "4px 0" }}>
            {data.top_clients.map((c, i) => (
              <div key={c.client_name} style={{ padding: "10px 14px", borderBottom: i < data.top_clients.length - 1 ? "1px solid var(--border)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.client_name}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", flexShrink: 0 }}>
                    {fmt$Full(c.revenue)} · {c.job_count} job{c.job_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <Bar pct={(c.revenue / maxClient) * 100} />
                {c.market_value > 0 && (
                  <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                    Homes MV {fmt$(c.market_value)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.jobs_with_amount === 0 && (
        <div className="card" style={{ padding: 16, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            Add Amount, Monthly rate, and Total paid on jobs to unlock revenue charts.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Demand ──────────────────────────────────────────────────────────────

function DemandTab() {
  const { data, isLoading } = useDemandReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Skel h={120} />
        {[...Array(5)].map((_, i) => <Skel key={i} h={48} />)}
      </div>
    );
  }
  if (!data) return null;

  const maxAssign = Math.max(...data.by_category.map((c) => c.assignments), 1);
  const maxTrend = Math.max(
    ...data.monthly_by_category.flatMap((m) => Object.values(m.counts)),
    1,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <SectionHeader title="Category demand" />
        <div className="card" style={{ padding: "4px 0" }}>
          {data.by_category.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", padding: 16, textAlign: "center" }}>No inventory yet</p>
          ) : (
            data.by_category.slice(0, 10).map((row, i) => (
              <div key={row.category} style={{ padding: "10px 14px", borderBottom: i < Math.min(10, data.by_category.length) - 1 ? "1px solid var(--border)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {getCategoryEmoji(row.category)} {row.category}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    {row.assignments} assign · {row.avg_jobs_per_item}/item
                  </span>
                </div>
                <Bar pct={(row.assignments / maxAssign) * 100} />
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  {row.staged} staged · {row.available} available · {fmtPct(row.utilization_pct)} util
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {data.top_category_names.length > 0 && (
        <div>
          <SectionHeader title="Assignments — last 6 months" />
          <div className="card" style={{ padding: "14px 12px 10px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110, marginBottom: 10 }}>
              {data.monthly_by_category.map((m) => {
                const total = data.top_category_names.reduce((s, c) => s + (m.counts[c] ?? 0), 0);
                return (
                  <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <div
                      style={{
                        width: "100%",
                        height: 80,
                        display: "flex",
                        flexDirection: "column-reverse",
                        borderRadius: "3px 3px 0 0",
                        overflow: "hidden",
                        background: "var(--bg-surface)",
                      }}
                    >
                      {data.top_category_names.map((cat, idx) => {
                        const v = m.counts[cat] ?? 0;
                        if (v <= 0) return null;
                        return (
                          <div
                            key={cat}
                            style={{
                              height: `${(v / maxTrend) * 80}px`,
                              background: CAT_COLORS[idx % CAT_COLORS.length],
                              opacity: 0.9,
                            }}
                            title={`${cat}: ${v}`}
                          />
                        );
                      })}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{monthLabel(m.month)}</span>
                    <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>{total || ""}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {data.top_category_names.map((cat, idx) => (
                <span key={cat} style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[idx % CAT_COLORS.length], display: "inline-block" }} />
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {data.top_items.length > 0 && (
        <div>
          <SectionHeader title="Highest-demand pieces" />
          <div className="list-card">
            {data.top_items.map((item, i) => (
              <div key={item.id} className="list-row">
                <span style={{ fontSize: 13, color: "var(--text-tertiary)", width: 18, flexShrink: 0 }}>#{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.category} · {item.sku}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span className="badge badge-blue">{item.job_count} job{item.job_count !== 1 ? "s" : ""}</span>
                  <span className={statusBadgeClass(item.status)} style={{ fontSize: 10 }}>{statusLabel(item.status)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.tight_supply.length > 0 && (
        <div>
          <SectionHeader title="High demand, currently out" />
          <div className="list-card">
            {data.tight_supply.map((item) => (
              <div key={item.id} className="list-row">
                <span style={{ fontSize: 18 }}>{getCategoryEmoji(item.category)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{item.job_count} past jobs · {item.category}</p>
                </div>
                <span className={statusBadgeClass(item.status)}>{statusLabel(item.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Activity (heatmaps) ─────────────────────────────────────────────────

function heatColor(level: number): string {
  // 0 empty → 4 hot, using accent-tinted greens that work on light/dark surfaces
  if (level <= 0) return "var(--bg-surface)";
  if (level === 1) return "rgba(13, 148, 136, 0.25)";
  if (level === 2) return "rgba(13, 148, 136, 0.45)";
  if (level === 3) return "rgba(13, 148, 136, 0.7)";
  return "rgba(13, 148, 136, 0.95)";
}

function ActivityTab() {
  const { data, isLoading } = useActivityReport();
  const [hover, setHover] = useState<{ date: string; staged: number; destaged: number; revenue: number } | null>(null);

  const weeks = useMemo(() => {
    if (!data) return [] as { date: string; staged: number; destaged: number; revenue: number }[][];
    const cols: { date: string; staged: number; destaged: number; revenue: number }[][] = [];
    for (let i = 0; i < data.heatmap.length; i += 7) {
      cols.push(data.heatmap.slice(i, i + 7));
    }
    return cols;
  }, [data]);

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Skel h={80} /><Skel h={80} />
        </div>
        <Skel h={140} />
        <Skel h={120} />
      </div>
    );
  }
  if (!data) return null;

  const maxWeekday = Math.max(...data.by_weekday.map((d) => d.staged + d.destaged), 1);
  const maxMonthly = Math.max(...data.monthly.map((m) => Math.max(m.staged, m.destaged)), 1);

  function levelFor(day: { staged: number; destaged: number }) {
    const total = day.staged + day.destaged;
    if (total <= 0) return 0;
    const ratio = total / data!.max_activity;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Currently staged" value={String(data.currently_staged)} sub="active / planning jobs" accent />
        <StatCard label="Destaged (tracked)" value={String(data.destaged_count)} sub="completed or destaged_at set" />
      </div>

      <div>
        <SectionHeader title="Staging activity heatmap" />
        <div className="card" style={{ padding: 12, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 3, minWidth: weeks.length * 12 }}>
            {/* Weekday labels */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginRight: 4, paddingTop: 0 }}>
              {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
                <div key={i} style={{ height: 11, fontSize: 9, color: "var(--text-tertiary)", lineHeight: "11px", width: 22 }}>
                  {label}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {week.map((day) => {
                  const lvl = levelFor(day);
                  return (
                    <div
                      key={day.date}
                      title={`${formatHeatDate(day.date)}: ${day.staged} staged, ${day.destaged} destaged`}
                      onMouseEnter={() => setHover(day)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(day)}
                      onBlur={() => setHover(null)}
                      tabIndex={0}
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 2,
                        background: heatColor(lvl),
                        outline: hover?.date === day.date ? "1px solid var(--text-secondary)" : undefined,
                        cursor: "default",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8 }}>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", minHeight: 16 }}>
              {hover
                ? `${formatHeatDate(hover.date)} · ${hover.staged} staged · ${hover.destaged} destaged${hover.revenue > 0 ? ` · ${fmt$Full(hover.revenue)}` : ""}`
                : "Staged-on + destaged activity over the past year"}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Less</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} style={{ width: 11, height: 11, borderRadius: 2, background: heatColor(l), display: "inline-block" }} />
              ))}
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>More</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="By day of week" />
        <div className="card" style={{ padding: "14px 14px 10px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
            {data.by_weekday.map((d) => {
              const total = d.staged + d.destaged;
              return (
                <div key={d.weekday} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600 }}>{total || ""}</span>
                  <div style={{ width: "100%", height: 56, display: "flex", flexDirection: "column-reverse", borderRadius: "3px 3px 0 0", overflow: "hidden", background: "var(--bg-surface)" }}>
                    <div style={{ height: `${(d.staged / maxWeekday) * 56}px`, background: "var(--accent)", opacity: 0.9 }} title={`Staged: ${d.staged}`} />
                    <div style={{ height: `${(d.destaged / maxWeekday) * 56}px`, background: "#0d9488", opacity: 0.85 }} title={`Destaged: ${d.destaged}`} />
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{weekdayLabel(d.weekday)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)", display: "inline-block" }} /> Staged on
            </span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#0d9488", display: "inline-block" }} /> Destaged
            </span>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Monthly staged vs destaged" />
        <div className="card" style={{ padding: "14px 14px 8px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
            {data.monthly.map((m) => (
              <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, width: "100%", height: 72 }}>
                  <div
                    style={{
                      flex: 1,
                      borderRadius: "3px 3px 0 0",
                      background: "var(--accent)",
                      opacity: 0.85,
                      height: `${Math.max(m.staged > 0 ? 4 : 0, (m.staged / maxMonthly) * 68)}px`,
                    }}
                    title={`Staged: ${m.staged}`}
                  />
                  <div
                    style={{
                      flex: 1,
                      borderRadius: "3px 3px 0 0",
                      background: "#0d9488",
                      opacity: 0.85,
                      height: `${Math.max(m.destaged > 0 ? 4 : 0, (m.destaged / maxMonthly) * 68)}px`,
                    }}
                    title={`Destaged: ${m.destaged}`}
                  />
                </div>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.busiest_days.length > 0 && (
        <div>
          <SectionHeader title="Busiest days" />
          <div className="list-card">
            {data.busiest_days.map((d) => (
              <div key={d.date} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{formatHeatDate(d.date)}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {d.staged} staged · {d.destaged} destaged
                    {d.revenue > 0 ? ` · ${fmt$Full(d.revenue)}` : ""}
                  </p>
                </div>
                <span className="badge badge-blue">{d.staged + d.destaged}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Overall utilization" value={fmtPct(data.overall_pct)} accent />
        <StatCard label="Dead stock" value={String(data.dead_stock.length)} sub="never staged" />
      </div>

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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Jobs completed" value={String(data.total_completed)} />
        <StatCard label="Avg duration" value={data.avg_duration_days > 0 ? `${data.avg_duration_days}d` : "—"} sub="start to close" />
        <StatCard label="On-time rate" value={data.total_completed > 0 ? fmtPct(data.on_time_rate_pct) : "—"} accent />
        <StatCard label="Damage rate" value={data.total_completed > 0 ? fmtPct(data.damage_rate_pct) : "—"} sub="jobs w/ damage" />
      </div>

      {(data.total_revenue > 0 || data.total_market_value > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <StatCard label="Completed revenue" value={fmt$Full(data.total_revenue)} sub={data.avg_amount > 0 ? `avg ${fmt$Full(data.avg_amount)}` : undefined} />
          <StatCard label="Completed MV" value={data.total_market_value > 0 ? fmt$(data.total_market_value) : "—"} sub="home market value" />
        </div>
      )}

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
      <div className="card" style={{ padding: 16 }}>
        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Total inventory value</p>
        <p style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-1px", marginBottom: 8 }}>{fmt$Full(data.total_value)}</p>
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
            Unstaged {fmt$Full(data.available_value)}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--accent)", display: "inline-block" }} />
            Staged {fmt$Full(data.staged_value)}
          </span>
        </div>
      </div>

      {data.disposed_count > 0 && (
        <div className="card" style={{ padding: 14, borderColor: "rgba(239,68,68,0.2)" }}>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>Written off (disposed)</p>
          <p style={{ fontSize: 20, fontWeight: 700, color: "var(--red-text)", letterSpacing: "-0.5px" }}>{fmt$Full(data.disposed_value)}</p>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{data.disposed_count} item{data.disposed_count !== 1 ? "s" : ""}</p>
        </div>
      )}

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
                    {fmt$Full(row.value)} · {row.count} item{row.count !== 1 ? "s" : ""}
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Damage events" value={String(data.total_damage_events)} sub="across all jobs" />
        <StatCard label="Items disposed" value={String(data.total_disposed_count)} sub={data.total_disposed_value > 0 ? fmt$Full(data.total_disposed_value) + " lost" : undefined} />
      </div>

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

type Tab = "revenue" | "demand" | "activity" | "utilization" | "performance" | "value" | "damage";

const TABS: { key: Tab; label: string }[] = [
  { key: "revenue",     label: "Revenue" },
  { key: "demand",      label: "Demand" },
  { key: "activity",    label: "Activity" },
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
  const [tab, setTab] = useState<Tab>("revenue");

  return (
    <div className="animate-in">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate("/more")} style={{ marginBottom: 8 }}>
          <BackIcon /> More
        </button>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Business & inventory analytics</p>
      </div>

      <div className="page-body">
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

        <div style={{ paddingBottom: 32 }}>
          {tab === "revenue"     && <RevenueTab />}
          {tab === "demand"      && <DemandTab />}
          {tab === "activity"    && <ActivityTab />}
          {tab === "utilization" && <UtilizationTab />}
          {tab === "performance" && <JobPerformanceTab />}
          {tab === "value"       && <InventoryValueTab />}
          {tab === "damage"      && <DamageLossTab />}
        </div>
      </div>
    </div>
  );
}
