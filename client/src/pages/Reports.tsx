import { useMemo, useState } from "react";
import {
  useUtilizationReport,
  useJobPerformanceReport,
  useInventoryValueReport,
  useDamageLossReport,
  useRevenueReport,
  useDemandReport,
  useActivityReport,
} from "../lib/queries";
import { getCategoryEmoji } from "../lib/utils";
import { BandBack, BandWatermark, ItemStatusPill } from "../components/b2";
import { Momentum } from "./reports/Momentum";

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
function Bar({ pct, color = "var(--brand)" }: { pct: number; color?: string }) {
  return (
    <div className="report-bar">
      <span style={{ background: color, width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function Skel({ w = "100%", h = 13 }: { w?: string | number; h?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: h > 30 ? 20 : 8 }} />;
}

function StatCard({ label, value, sub, accent, tone }: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  tone?: "green" | "teal" | "amber" | "red";
}) {
  const color = tone ? `var(--${tone}-text)` : accent ? "var(--brand)" : "var(--ink)";
  return (
    <div className={`card report-stat${accent ? " is-accent" : ""}`}>
      <p className="stat-label">{label}</p>
      <p className="report-stat-value" style={{ color }}>{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="report-section-title">{title}</h2>;
}

function Rank({ n }: { n: number }) {
  return <span className={`report-rank${n === 1 ? " is-first" : ""}`}>{n}</span>;
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
    return <p className="report-empty">{emptyLabel}</p>;
  }
  const money = valueKey === "revenue" || valueKey === "extensions";
  return (
    <div className="vbars">
      {items.map((m) => {
        const v = Number(m[valueKey]) || 0;
        return (
          <div key={m.month} className="vbar-col" title={`${monthLabel(String(m.month))}: ${money ? fmt$Full(v) : v}`}>
            <span className="vbar-value">{v > 0 ? (money ? fmt$(v) : v) : ""}</span>
            <div className="vbar-track">
              <div className={`vbar${v === max ? " is-max" : ""}`} style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%` }} />
            </div>
            <span className="vbar-label">{monthLabel(String(m.month))}</span>
          </div>
        );
      })}
    </div>
  );
}

const CAT_COLORS = [
  "var(--brand)",
  "var(--teal)",
  "var(--amber)",
  "#C2549B",
  "var(--gray)",
];

// ─── Tab: Revenue ─────────────────────────────────────────────────────────────

function RevenueTab() {
  const { data, isLoading } = useRevenueReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="report-stats">
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
    <div className="report-tab">
      <div className="report-stats">
        <StatCard label="Collected revenue" value={fmt$Full(data.collected_revenue)} sub="completed jobs" accent />
        <StatCard label="Pipeline" value={fmt$Full(data.pipeline_revenue)} sub="active + planning" />
        <StatCard label="Avg staging amount" value={data.avg_amount > 0 ? fmt$Full(data.avg_amount) : "—"} sub={data.avg_monthly_rate > 0 ? `${fmt$(data.avg_monthly_rate)}/mo avg` : undefined} />
        <StatCard label="Extensions" value={fmt$Full(data.extension_revenue)} sub="extension fees" />
      </div>

      <div className="report-stats">
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
        <div className="card report-chart">
          <VerticalBars items={data.monthly} valueKey="revenue" emptyLabel="No revenue recorded yet — add Amount / Total paid on jobs" />
        </div>
      </div>

      {data.monthly.some((m) => m.extensions > 0) && (
        <div>
          <SectionHeader title="Extension fees by month" />
          <div className="card report-chart">
            <VerticalBars items={data.monthly} valueKey="extensions" emptyLabel="No extensions yet" />
          </div>
        </div>
      )}

      {data.top_clients.length > 0 && (
        <div>
          <SectionHeader title="Top clients by revenue" />
          <div className="card report-list">
            {data.top_clients.map((c, i) => (
              <div key={c.client_name} style={{ padding: "12px 16px", borderBottom: i < data.top_clients.length - 1 ? "1px solid var(--row-divider)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.client_name}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--ink-secondary)", fontWeight: 600, flexShrink: 0 }}>
                    {fmt$Full(c.revenue)} · {c.job_count} job{c.job_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <Bar pct={(c.revenue / maxClient) * 100} />
                {c.market_value > 0 && (
                  <p style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 6 }}>
                    Homes MV {fmt$(c.market_value)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.jobs_with_amount === 0 && (
        <div className="card report-wide">
          <p className="report-empty">
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
    <div className="report-tab">
      <div>
        <SectionHeader title="Category demand" />
        <div className="card report-list">
          {data.by_category.length === 0 ? (
            <p className="report-empty">No inventory yet</p>
          ) : (
            data.by_category.slice(0, 10).map((row, i) => (
              <div key={row.category} style={{ padding: "12px 16px", borderBottom: i < Math.min(10, data.by_category.length) - 1 ? "1px solid var(--row-divider)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="report-cat-emoji" aria-hidden>{getCategoryEmoji(row.category)}</span>{row.category}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--ink-secondary)", fontWeight: 600 }}>
                    {row.assignments} assign · {row.avg_jobs_per_item}/item
                  </span>
                </div>
                <Bar pct={(row.assignments / maxAssign) * 100} />
                <p style={{ fontSize: 12, color: "var(--ink-secondary)", marginTop: 6 }}>
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
          <div className="card report-chart">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 190, marginBottom: 12 }}>
              {data.monthly_by_category.map((m) => {
                const total = data.top_category_names.reduce((s, c) => s + (m.counts[c] ?? 0), 0);
                return (
                  <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <div
                      style={{
                        width: "100%",
                        height: 150,
                        display: "flex",
                        flexDirection: "column-reverse",
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "#F4EFFA",
                      }}
                    >
                      {data.top_category_names.map((cat, idx) => {
                        const v = m.counts[cat] ?? 0;
                        if (v <= 0) return null;
                        return (
                          <div
                            key={cat}
                            style={{
                              height: `${(v / maxTrend) * 150}px`,
                              background: CAT_COLORS[idx % CAT_COLORS.length],
                            }}
                            title={`${cat}: ${v}`}
                          />
                        );
                      })}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{monthLabel(m.month)}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-secondary)" }}>{total || ""}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {data.top_category_names.map((cat, idx) => (
                <span key={cat} style={{ fontSize: 13, color: "var(--ink-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLORS[idx % CAT_COLORS.length], display: "inline-block" }} />
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
                <Rank n={i + 1} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{item.category} · {item.sku}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span className="badge badge-brand">{item.job_count} job{item.job_count !== 1 ? "s" : ""}</span>
                  <ItemStatusPill status={item.status} style={{ fontSize: 10 }} />
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
                <span className="thumb" aria-hidden>{getCategoryEmoji(item.category)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{item.job_count} past jobs · {item.category}</p>
                </div>
                <ItemStatusPill status={item.status} />
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
  if (level <= 0) return "#F1EBF8";
  if (level === 1) return "#DCC8F2";
  if (level === 2) return "#B68AE3";
  if (level === 3) return "#8E4BD0";
  return "var(--brand)";
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
        <div className="report-stats">
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
    <div className="report-tab">
      <div className="report-stats">
        <StatCard label="Currently staged" value={String(data.currently_staged)} sub="active / planning jobs" tone="teal" />
        <StatCard tone="green" label="Destaged (tracked)" value={String(data.destaged_count)} sub="completed or destaged_at set" />
      </div>

      <div>
        <SectionHeader title="Staging activity heatmap" />
        <div className="card report-chart" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 3, justifyContent: "space-between", minWidth: weeks.length * 16 }}>
            {/* Weekday labels */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginRight: 4, paddingTop: 0 }}>
              {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
                <div key={i} style={{ height: 13, fontSize: 12, color: "var(--ink-secondary)", lineHeight: "13px", width: 24 }}>
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
                        width: 13,
                        height: 13,
                        borderRadius: 3,
                        background: heatColor(lvl),
                        outline: hover?.date === day.date ? "2px solid var(--ink)" : undefined,
                        cursor: "default",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8 }}>
            <p style={{ fontSize: 13, color: "var(--ink-secondary)", minHeight: 18 }}>
              {hover
                ? `${formatHeatDate(hover.date)} · ${hover.staged} staged · ${hover.destaged} destaged${hover.revenue > 0 ? ` · ${fmt$Full(hover.revenue)}` : ""}`
                : "Staged-on + destaged activity over the past year"}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>Less</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <span key={l} style={{ width: 12, height: 12, borderRadius: 3, background: heatColor(l), display: "inline-block" }} />
              ))}
              <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>More</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="By day of week" />
        <div className="card report-chart">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 170 }}>
            {data.by_weekday.map((d) => {
              const total = d.staged + d.destaged;
              return (
                <div key={d.weekday} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-secondary)", fontWeight: 600 }}>{total || ""}</span>
                  <div style={{ width: "100%", height: 130, display: "flex", flexDirection: "column-reverse", borderRadius: 8, overflow: "hidden", background: "#F4EFFA" }}>
                    <div style={{ height: `${(d.staged / maxWeekday) * 130}px`, background: "var(--teal)" }} title={`Staged: ${d.staged}`} />
                    <div style={{ height: `${(d.destaged / maxWeekday) * 130}px`, background: "var(--green)" }} title={`Destaged: ${d.destaged}`} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{weekdayLabel(d.weekday)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
            <span style={{ fontSize: 13, color: "var(--ink-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--teal)", display: "inline-block" }} /> Staged on
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--green)", display: "inline-block" }} /> Destaged
            </span>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Monthly staged vs destaged" />
        <div className="card report-chart">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 170 }}>
            {data.monthly.map((m) => (
              <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, width: "100%", height: 140 }}>
                  <div
                    style={{
                      flex: 1,
                      borderRadius: "6px 6px 2px 2px",
                      background: "var(--teal)",
                      height: `${Math.max(m.staged > 0 ? 4 : 0, (m.staged / maxMonthly) * 136)}px`,
                    }}
                    title={`Staged: ${m.staged}`}
                  />
                  <div
                    style={{
                      flex: 1,
                      borderRadius: "6px 6px 2px 2px",
                      background: "var(--green)",
                      height: `${Math.max(m.destaged > 0 ? 4 : 0, (m.destaged / maxMonthly) * 136)}px`,
                    }}
                    title={`Destaged: ${m.destaged}`}
                  />
                </div>
                <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{monthLabel(m.month)}</span>
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
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{formatHeatDate(d.date)}</p>
                  <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>
                    {d.staged} staged · {d.destaged} destaged
                    {d.revenue > 0 ? ` · ${fmt$Full(d.revenue)}` : ""}
                  </p>
                </div>
                <span className="badge badge-teal">{d.staged + d.destaged}</span>
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
        <div className="report-stats">
          <Skel h={80} /><Skel h={80} />
        </div>
        {[...Array(4)].map((_, i) => <Skel key={i} h={48} />)}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="report-tab">
      <div className="report-stats">
        <StatCard label="Overall utilization" value={fmtPct(data.overall_pct)} accent />
        <StatCard label="Dead stock" tone={data.dead_stock.length > 0 ? "amber" : undefined} value={String(data.dead_stock.length)} sub="never staged" />
      </div>

      <div>
        <SectionHeader title="By category" />
        <div className="card report-list">
          {data.by_category.length === 0 ? (
            <p className="report-empty">No data yet</p>
          ) : (
            data.by_category.map((row) => (
              <div key={row.category} style={{ padding: "12px 16px", borderBottom: "1px solid var(--row-divider)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="report-cat-emoji" aria-hidden>{getCategoryEmoji(row.category)}</span>{row.category}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--ink-secondary)", fontWeight: 600 }}>
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
                <Rank n={i + 1} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{item.category}</p>
                </div>
                <span className="badge badge-brand">{item.job_count} job{item.job_count !== 1 ? "s" : ""}</span>
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
                <span className="thumb" aria-hidden>{getCategoryEmoji(item.category)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p className="sku">{item.sku}</p>
                </div>
              </div>
            ))}
            {data.dead_stock.length > 8 && (
              <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--ink-secondary)", fontWeight: 600, textAlign: "center" }}>
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
        <div className="report-stats">
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
    <div className="report-tab">
      <div className="report-stats">
        <StatCard label="Jobs completed" value={String(data.total_completed)} />
        <StatCard label="Avg duration" value={data.avg_duration_days > 0 ? `${data.avg_duration_days}d` : "—"} sub="start to close" />
        <StatCard label="On-time rate" value={data.total_completed > 0 ? fmtPct(data.on_time_rate_pct) : "—"} accent />
        <StatCard label="Damage rate" value={data.total_completed > 0 ? fmtPct(data.damage_rate_pct) : "—"} sub="jobs w/ damage" />
      </div>

      {(data.total_revenue > 0 || data.total_market_value > 0) && (
        <div className="report-stats">
          <StatCard label="Completed revenue" value={fmt$Full(data.total_revenue)} sub={data.avg_amount > 0 ? `avg ${fmt$Full(data.avg_amount)}` : undefined} />
          <StatCard label="Completed MV" value={data.total_market_value > 0 ? fmt$(data.total_market_value) : "—"} sub="home market value" />
        </div>
      )}

      <div>
        <SectionHeader title="Completions — last 6 months" />
        <div className="card report-chart">
          {data.monthly_completions.every((m) => m.count === 0) ? (
            <p className="report-empty">No completed jobs yet</p>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 170 }}>
              {data.monthly_completions.map((m) => (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-secondary)", fontWeight: 600 }}>{m.count || ""}</span>
                  <div
                    style={{
                      width: "100%",
                      borderRadius: "6px 6px 2px 2px",
                      background: "var(--brand)",
                      height: `${Math.max(4, (m.count / maxMonth) * 130)}px`,
                      transition: "height 0.4s ease",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--ink-secondary)" }}>{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {data.top_clients.length > 0 && (
        <div>
          <SectionHeader title="Top clients" />
          <div className="card report-list">
            {data.top_clients.map((c, i) => {
              const maxJobs = data.top_clients[0].job_count;
              return (
                <div key={c.client_name} style={{ padding: "12px 16px", borderBottom: i < data.top_clients.length - 1 ? "1px solid var(--row-divider)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{c.client_name}</span>
                    <span style={{ fontSize: 13, color: "var(--ink-secondary)", fontWeight: 600 }}>{c.job_count} job{c.job_count !== 1 ? "s" : ""}</span>
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
    <div className="report-tab">
      <div className="card report-wide report-hero">
        <p className="stat-label">Total inventory value</p>
        <p className="report-hero-value">{fmt$Full(data.total_value)}</p>
        <div style={{ height: 12, borderRadius: 999, background: "#F1EBF8", overflow: "hidden", display: "flex", gap: 2, margin: "12px 0 10px" }}>
          {data.total_value > 0 && (
            <>
              <div style={{ width: `${(data.available_value / data.total_value) * 100}%`, background: "var(--green)", transition: "width 0.4s" }} />
              <div style={{ width: `${(data.staged_value / data.total_value) * 100}%`, background: "var(--teal)", transition: "width 0.4s" }} />
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ fontSize: 13, color: "var(--ink-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--green)", display: "inline-block" }} />
            Unstaged {fmt$Full(data.available_value)}
          </span>
          <span style={{ fontSize: 13, color: "var(--ink-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--teal)", display: "inline-block" }} />
            Staged {fmt$Full(data.staged_value)}
          </span>
        </div>
      </div>

      {data.disposed_count > 0 && (
        <div className="card report-stat">
          <p className="stat-label">Written off (disposed)</p>
          <p className="report-stat-value" style={{ color: "var(--red-text)" }}>{fmt$Full(data.disposed_value)}</p>
          <p className="stat-sub">{data.disposed_count} item{data.disposed_count !== 1 ? "s" : ""}</p>
        </div>
      )}

      <div>
        <SectionHeader title="Value by category" />
        <div className="card report-list">
          {data.by_category.length === 0 ? (
            <p className="report-empty">No data yet</p>
          ) : (
            data.by_category.map((row, i) => (
              <div key={row.category} style={{ padding: "12px 16px", borderBottom: i < data.by_category.length - 1 ? "1px solid var(--row-divider)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="report-cat-emoji" aria-hidden>{getCategoryEmoji(row.category)}</span>{row.category}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--ink-secondary)", fontWeight: 600 }}>
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
  damaged: "badge-red",
  dispose: "badge-gray",
};

function DamageLossTab() {
  const { data, isLoading } = useDamageLossReport();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="report-stats">
          <Skel h={80} /><Skel h={80} />
        </div>
        {[...Array(4)].map((_, i) => <Skel key={i} h={48} />)}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="report-tab">
      <div className="report-stats">
        <StatCard label="Damage events" tone={data.total_damage_events > 0 ? "red" : undefined} value={String(data.total_damage_events)} sub="across all jobs" />
        <StatCard label="Items disposed" value={String(data.total_disposed_count)} sub={data.total_disposed_value > 0 ? fmt$Full(data.total_disposed_value) + " lost" : undefined} />
      </div>

      {data.top_damaged_items.length > 0 && (
        <div>
          <SectionHeader title="Most frequently damaged" />
          <div className="list-card">
            {data.top_damaged_items.map((item, i) => (
              <div key={item.id} className="list-row">
                <Rank n={i + 1} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</p>
                  <p style={{ fontSize: 13, color: "var(--ink-secondary)" }}>{item.category} · {item.sku}</p>
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
              <div key={i} style={{ padding: "12px 16px", borderBottom: i < data.recent_events.length - 1 ? "1px solid var(--row-divider)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.item_name}</p>
                    <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.job_address} · {ev.job_client}
                    </p>
                    {ev.notes && (
                      <p style={{ fontSize: 13, color: "var(--ink-secondary)", marginTop: 2, fontStyle: "italic" }}>{ev.notes}</p>
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
        <div className="card report-wide">
          <p className="report-empty">No damage events recorded yet.</p>
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

const TAB_BLURB: Record<Tab, string> = {
  revenue: "What jobs have earned and what's in the pipeline",
  demand: "Which pieces and categories get booked most",
  activity: "When furniture goes out and comes back",
  utilization: "How much of the inventory is working",
  performance: "How jobs run from install to pickup",
  value: "What the inventory is worth, and where it is",
  damage: "Damage and write-offs from returns",
};

export function Reports() {
  const [tab, setTab] = useState<Tab>("revenue");

  return (
    <div className="animate-in">
      <div className="page-header">
        <BandWatermark kind="chart" />
        <div className="reports-back"><BandBack to="/more" label="More" /></div>
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Where the business is heading, and how fast</p>
      </div>

      <div className="page-body">
        <Momentum />

        <div className="report-tabs" role="tablist" aria-label="Report">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`report-tab-btn${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="report-blurb">{TAB_BLURB[tab]}</p>

        <div key={tab} className="animate-in" style={{ paddingBottom: 32 }}>
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
