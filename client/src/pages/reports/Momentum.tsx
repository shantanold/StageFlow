import { useMemo } from "react";
import { useActivityReport } from "../../lib/queries";

/**
 * Trajectory at a glance: the last 30 days against the 30 before, plus a
 * 12-week sparkline, for installs, pickups, revenue booked and homes on site.
 * Built from the activity report's daily series (counts are jobs/homes).
 */

type Day = { date: string; staged: number; destaged: number; revenue: number };
type Key = "staged" | "destaged" | "revenue";

function sumRange(days: Day[], from: number, to: number, key: Key) {
  let total = 0;
  for (let i = Math.max(0, from); i < Math.min(days.length, to); i++) total += days[i][key];
  return total;
}

/** 12 weekly totals ending today, oldest first. */
function weekly(days: Day[], key: Key, weeks = 12) {
  const out: number[] = [];
  const end = days.length;
  for (let w = weeks - 1; w >= 0; w--) out.push(sumRange(days, end - (w + 1) * 7, end - w * 7, key));
  return out;
}

function money(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 120, h = 34, pad = 3;
  const max = Math.max(...values, 1);
  const step = (w - pad * 2) / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${(pad + (values.length - 1) * step).toFixed(1)},${h - pad}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={3} fill={color} />
    </svg>
  );
}

function Delta({ now, before, goodWhenUp = true, format = (n: number) => String(n) }: {
  now: number;
  before: number;
  goodWhenUp?: boolean | null;
  format?: (n: number) => string;
}) {
  const diff = now - before;
  if (diff === 0) return <span className="delta is-flat">— same as prior 30d</span>;
  const up = diff > 0;
  const tone = goodWhenUp === null ? "is-neutral" : up === goodWhenUp ? "is-good" : "is-bad";
  const pct = before > 0 ? `${Math.round((Math.abs(diff) / before) * 100)}%` : `${up ? "+" : "−"}${format(Math.abs(diff))}`;
  return (
    <span className={`delta ${tone}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d={up ? "M6 2l4 5H2z" : "M6 10L2 5h8z"} fill="currentColor" /></svg>
      {pct} <span className="delta-vs">vs prior 30d</span>
    </span>
  );
}

export function Momentum() {
  const { data, isLoading } = useActivityReport();

  const m = useMemo(() => {
    if (!data) return null;
    // The series runs to today; drop any padding after the last real day.
    const days = data.heatmap;
    const n = days.length;
    const last = (key: Key) => sumRange(days, n - 30, n, key);
    const prior = (key: Key) => sumRange(days, n - 60, n - 30, key);
    const pace = (key: Key) => sumRange(days, n - 84, n, key) / 12;
    return {
      installs: { now: last("staged"), before: prior("staged"), pace: pace("staged"), spark: weekly(days, "staged") },
      pickups: { now: last("destaged"), before: prior("destaged"), pace: pace("destaged"), spark: weekly(days, "destaged") },
      revenue: { now: last("revenue"), before: prior("revenue"), pace: pace("revenue"), spark: weekly(days, "revenue") },
      net: {
        now: last("staged") - last("destaged"),
        onSite: data.currently_staged,
        spark: weekly(days, "staged").map((v, i) => v - weekly(days, "destaged")[i]),
      },
    };
  }, [data]);

  if (isLoading || !m) {
    return (
      <div className="momentum" aria-hidden>
        {[0, 1, 2, 3].map((i) => <div key={i} className="card momentum-card skeleton" style={{ height: 132 }} />)}
      </div>
    );
  }

  const fmtPace = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1));

  return (
    <section className="momentum" aria-label="Last 30 days">
      <div className="card momentum-card">
        <p className="stat-label">Installs · 30d</p>
        <div className="momentum-row">
          <p className="momentum-value">{m.installs.now}</p>
          <Sparkline values={m.installs.spark} color="var(--teal)" />
        </div>
        <Delta now={m.installs.now} before={m.installs.before} />
        <p className="stat-sub">{fmtPace(m.installs.pace)} homes / week over 12 weeks</p>
      </div>

      <div className="card momentum-card">
        <p className="stat-label">Pickups · 30d</p>
        <div className="momentum-row">
          <p className="momentum-value">{m.pickups.now}</p>
          <Sparkline values={m.pickups.spark} color="var(--green)" />
        </div>
        <Delta now={m.pickups.now} before={m.pickups.before} goodWhenUp={null} />
        <p className="stat-sub">{fmtPace(m.pickups.pace)} homes / week over 12 weeks</p>
      </div>

      <div className="card momentum-card">
        <p className="stat-label">Revenue booked · 30d</p>
        <div className="momentum-row">
          <p className="momentum-value">{money(m.revenue.now)}</p>
          <Sparkline values={m.revenue.spark} color="var(--brand)" />
        </div>
        <Delta now={m.revenue.now} before={m.revenue.before} format={money} />
        <p className="stat-sub">{money(m.revenue.pace)} / week over 12 weeks</p>
      </div>

      <div className="card momentum-card">
        <p className="stat-label">Homes on site</p>
        <div className="momentum-row">
          <p className="momentum-value">{m.net.onSite}</p>
          <Sparkline values={m.net.spark} color="var(--plum)" />
        </div>
        <span className={`delta ${m.net.now > 0 ? "is-good" : m.net.now < 0 ? "is-neutral" : "is-flat"}`}>
          {m.net.now === 0 ? "— no net change in 30d" : `${m.net.now > 0 ? "+" : "−"}${Math.abs(m.net.now)} net in 30d`}
        </span>
        <p className="stat-sub">installs minus pickups, weekly</p>
      </div>
    </section>
  );
}
