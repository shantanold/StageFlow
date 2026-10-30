import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

/** Prefer total_paid, else amount + extension, else amount. */
function jobRevenue(job: {
  total_paid: unknown;
  amount: unknown;
  extension_amount: unknown;
}): number {
  if (job.total_paid != null) return Number(job.total_paid);
  const amount = job.amount != null ? Number(job.amount) : 0;
  const extension = job.extension_amount != null ? Number(job.extension_amount) : 0;
  return amount + extension;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// ─── GET /stats/dashboard ────────────────────────────────────────────────────

router.get("/dashboard", async (_req, res) => {
  try {
    const [itemCounts, jobCounts, totalValue, upcomingJobs] = await Promise.all([
      // Item status breakdown (non-disposed only)
      prisma.item.groupBy({
        by: ["status"],
        where: { status: { not: "disposed" } },
        _count: true,
      }),

      // Job status breakdown
      prisma.job.groupBy({
        by: ["status"],
        _count: true,
      }),

      // Total inventory value (non-disposed)
      prisma.item.aggregate({
        where: { status: { not: "disposed" } },
        _sum: { purchase_cost: true },
      }),

      // Active jobs sorted by expected close date (for upcoming returns)
      prisma.job.findMany({
        where: { status: { in: ["active", "planning"] } },
        orderBy: { expected_end_date: "asc" },
        include: { _count: { select: { job_items: true } } },
      }),
    ]);

    // Parse item counts
    const availableCount = itemCounts.find((r) => r.status === "available")?._count ?? 0;
    const stagedCount    = itemCounts.find((r) => r.status === "staged")?._count    ?? 0;
    const missingCount   = itemCounts.find((r) => r.status === "missing")?._count   ?? 0;
    const totalItems     = availableCount + stagedCount + missingCount;

    // Damaged or missing items need attention
    const needsAttention = await prisma.item.count({
      where: {
        status: { not: "disposed" },
        OR: [{ condition: "damaged" }, { status: "missing" }],
      },
    });

    // Active jobs count (currently in progress or planning)
    const activeJobsCount =
      (jobCounts.find((r) => r.status === "active")?._count  ?? 0) +
      (jobCounts.find((r) => r.status === "planning")?._count ?? 0);

    // Major pieces: match category or name (seeded tables often share category "Table")
    const MAJOR_PIECE_DEFS = [
      { key: "sofa",            label: "Sofas",            pattern: /\bsofas?\b/i },
      { key: "dining_table",    label: "Dining Tables",    pattern: /dining\s*tables?/i },
      { key: "breakfast_table", label: "Breakfast Tables", pattern: /breakfast\s*tables?/i },
      { key: "coffee_table",    label: "Coffee Tables",    pattern: /coffee\s*tables?/i },
    ] as const;

    const majorCandidates = await prisma.item.findMany({
      where: { status: { in: ["available", "staged"] } },
      select: { category: true, name: true, status: true },
    });

    const major_pieces = MAJOR_PIECE_DEFS.map((def) => {
      const matched = majorCandidates.filter(
        (it) => def.pattern.test(it.category) || def.pattern.test(it.name)
      );
      return {
        key: def.key,
        label: def.label,
        available: matched.filter((it) => it.status === "available").length,
        staged: matched.filter((it) => it.status === "staged").length,
      };
    });

    // Utilization
    const utilizationPct = totalItems > 0 ? Math.round((stagedCount / totalItems) * 100) : 0;

    // Total value (Prisma Decimal → string → number)
    const totalInventoryValue = Number(totalValue._sum.purchase_cost ?? 0);

    const upcomingJobRows = upcomingJobs.map(({ _count, ...j }) => ({
      ...j,
      item_count: _count.job_items,
    }));

    return res.json({
      available_count:      availableCount,
      staged_count:         stagedCount,
      total_items:          totalItems,
      active_jobs_count:    activeJobsCount,
      needs_attention:      needsAttention,
      utilization_pct:      utilizationPct,
      total_inventory_value: totalInventoryValue,
      upcoming_jobs:        upcomingJobRows,
      major_pieces,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /stats/reports/utilization ─────────────────────────────────────────

router.get("/reports/utilization", async (_req, res) => {
  try {
    const [allCounts, stagedCounts, deadStock, topItemsRaw] = await Promise.all([
      prisma.item.groupBy({
        by: ["category"],
        where: { status: { not: "disposed" } },
        _count: true,
      }),
      prisma.item.groupBy({
        by: ["category"],
        where: { status: "staged" },
        _count: true,
      }),
      prisma.item.findMany({
        where: { status: { not: "disposed" }, job_items: { none: {} } },
        select: { id: true, sku: true, name: true, category: true },
        orderBy: { created_at: "desc" },
      }),
      prisma.item.findMany({
        where: { status: { not: "disposed" } },
        select: {
          id: true,
          name: true,
          category: true,
          _count: { select: { job_items: true } },
        },
        orderBy: { job_items: { _count: "desc" } },
        take: 5,
      }),
    ]);

    const stagedMap = new Map(stagedCounts.map((r) => [r.category, r._count]));
    const byCategory = allCounts
      .map((r) => ({
        category: r.category,
        total: r._count,
        staged: stagedMap.get(r.category) ?? 0,
        utilization_pct: Math.round(((stagedMap.get(r.category) ?? 0) / r._count) * 100),
      }))
      .sort((a, b) => b.utilization_pct - a.utilization_pct);

    const totalNonDisposed = allCounts.reduce((s, r) => s + r._count, 0);
    const totalStaged = stagedCounts.reduce((s, r) => s + r._count, 0);

    return res.json({
      overall_pct: totalNonDisposed > 0 ? Math.round((totalStaged / totalNonDisposed) * 100) : 0,
      by_category: byCategory,
      dead_stock: deadStock,
      top_items: topItemsRaw.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        job_count: i._count.job_items,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /stats/reports/job-performance ──────────────────────────────────────

router.get("/reports/job-performance", async (_req, res) => {
  try {
    const completedJobs = await prisma.job.findMany({
      where: { status: "completed" },
      include: { job_items: { select: { return_condition: true } } },
    });

    const totalCompleted = completedJobs.length;

    // Average duration in days (start → actual close)
    const durations = completedJobs
      .filter((j) => j.actual_end_date)
      .map((j) => {
        const start = new Date(j.start_date).getTime();
        const end   = new Date(j.actual_end_date!).getTime();
        return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
      });
    const avgDurationDays =
      durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : 0;

    // On-time: actual_end_date <= expected_end_date
    const onTimeCount = completedJobs.filter((j) => {
      if (!j.actual_end_date) return false;
      return new Date(j.actual_end_date) <= new Date(j.expected_end_date);
    }).length;
    const onTimeRatePct = totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : 0;

    // Top clients by completed job count
    const clientMap = new Map<string, number>();
    for (const j of completedJobs) {
      clientMap.set(j.client_name, (clientMap.get(j.client_name) ?? 0) + 1);
    }
    const topClients = Array.from(clientMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([client_name, job_count]) => ({ client_name, job_count }));

    // Monthly completions for the last 6 months
    const monthMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, 0);
    }
    for (const j of completedJobs) {
      if (!j.actual_end_date) continue;
      const d = new Date(j.actual_end_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthMap.has(key)) monthMap.set(key, monthMap.get(key)! + 1);
    }
    const monthlyCompletions = Array.from(monthMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));

    // Damage rate: % of completed jobs with at least one damaged/disposed return
    const jobsWithDamage = completedJobs.filter((j) =>
      j.job_items.some((ji) => ji.return_condition === "damaged" || ji.return_condition === "dispose")
    ).length;
    const damageRatePct = totalCompleted > 0 ? Math.round((jobsWithDamage / totalCompleted) * 100) : 0;

    const revenues = completedJobs.map(jobRevenue);
    const totalRevenue = roundMoney(revenues.reduce((s, n) => s + n, 0));
    const amounts = completedJobs
      .map((j) => (j.amount != null ? Number(j.amount) : null))
      .filter((n): n is number => n != null && Number.isFinite(n));
    const avgAmount =
      amounts.length > 0 ? roundMoney(amounts.reduce((s, n) => s + n, 0) / amounts.length) : 0;
    const totalMarketValue = roundMoney(
      completedJobs.reduce((s, j) => s + (j.market_value != null ? Number(j.market_value) : 0), 0),
    );

    return res.json({
      total_completed:    totalCompleted,
      avg_duration_days:  avgDurationDays,
      on_time_rate_pct:   onTimeRatePct,
      damage_rate_pct:    damageRatePct,
      top_clients:        topClients,
      monthly_completions: monthlyCompletions,
      total_revenue: totalRevenue,
      avg_amount: avgAmount,
      total_market_value: totalMarketValue,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /stats/reports/inventory-value ──────────────────────────────────────

router.get("/reports/inventory-value", async (_req, res) => {
  try {
    const [byCategory, availableAgg, stagedAgg, disposedAgg] = await Promise.all([
      prisma.item.groupBy({
        by: ["category"],
        where: { status: { not: "disposed" } },
        _sum: { purchase_cost: true },
        _count: true,
      }),
      prisma.item.aggregate({
        where: { status: "available" },
        _sum: { purchase_cost: true },
      }),
      prisma.item.aggregate({
        where: { status: "staged" },
        _sum: { purchase_cost: true },
      }),
      prisma.item.aggregate({
        where: { status: "disposed" },
        _sum: { purchase_cost: true },
        _count: true,
      }),
    ]);

    const availableValue = Number(availableAgg._sum.purchase_cost ?? 0);
    const stagedValue    = Number(stagedAgg._sum.purchase_cost    ?? 0);

    return res.json({
      total_value:     availableValue + stagedValue,
      available_value: availableValue,
      staged_value:    stagedValue,
      disposed_value:  Number(disposedAgg._sum.purchase_cost ?? 0),
      disposed_count:  disposedAgg._count,
      by_category: byCategory
        .map((r) => ({
          category: r.category,
          value:    Number(r._sum.purchase_cost ?? 0),
          count:    r._count,
        }))
        .sort((a, b) => b.value - a.value),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /stats/reports/damage-loss ──────────────────────────────────────────

router.get("/reports/damage-loss", async (_req, res) => {
  try {
    const [totalDamageEvents, disposedAgg, topDamagedGrouped, recentEvents] = await Promise.all([
      prisma.jobItem.count({
        where: { return_condition: { in: ["damaged", "dispose"] } },
      }),
      prisma.item.aggregate({
        where: { status: "disposed" },
        _sum: { purchase_cost: true },
        _count: true,
      }),
      prisma.jobItem.groupBy({
        by: ["item_id"],
        where: { return_condition: { in: ["damaged", "dispose"] } },
        _count: { item_id: true },
        orderBy: { _count: { item_id: "desc" } },
        take: 5,
      }),
      prisma.jobItem.findMany({
        where: { return_condition: { in: ["damaged", "dispose"] } },
        include: {
          item: { select: { name: true, sku: true, category: true } },
          job:  { select: { address: true, client_name: true } },
        },
        orderBy: { returned_at: "desc" },
        take: 10,
      }),
    ]);

    // Bulk-fetch item info for top damaged
    const topItemIds = topDamagedGrouped.map((r) => r.item_id);
    const topItemsInfo = await prisma.item.findMany({
      where: { id: { in: topItemIds } },
      select: { id: true, name: true, sku: true, category: true },
    });
    const topItemsMap = new Map(topItemsInfo.map((i) => [i.id, i]));
    const topDamagedItems = topDamagedGrouped.map((r) => ({
      ...topItemsMap.get(r.item_id),
      damage_count: r._count.item_id,
    }));

    return res.json({
      total_damage_events:  totalDamageEvents,
      total_disposed_count: disposedAgg._count,
      total_disposed_value: Number(disposedAgg._sum.purchase_cost ?? 0),
      top_damaged_items:    topDamagedItems,
      recent_events: recentEvents.map((r) => ({
        item_name:     r.item.name,
        item_sku:      r.item.sku,
        item_category: r.item.category,
        job_address:   r.job?.address ?? "Unknown",
        job_client:    r.job?.client_name ?? "Unknown",
        condition:     r.return_condition,
        notes:         r.return_notes,
        returned_at:   r.returned_at,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /stats/reports/revenue ──────────────────────────────────────────────

router.get("/reports/revenue", async (_req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { status: { not: "cancelled" } },
      select: {
        id: true,
        status: true,
        client_name: true,
        start_date: true,
        actual_end_date: true,
        destaged_at: true,
        amount: true,
        monthly_rate: true,
        extension_amount: true,
        total_paid: true,
        market_value: true,
      },
    });

    const active = jobs.filter((j) => j.status === "active" || j.status === "planning");
    const completed = jobs.filter((j) => j.status === "completed");

    const collected = roundMoney(completed.reduce((s, j) => s + jobRevenue(j), 0));
    const pipeline = roundMoney(active.reduce((s, j) => s + jobRevenue(j), 0));
    const extensionRevenue = roundMoney(
      jobs.reduce((s, j) => s + (j.extension_amount != null ? Number(j.extension_amount) : 0), 0),
    );
    const amounts = jobs
      .map((j) => (j.amount != null ? Number(j.amount) : null))
      .filter((n): n is number => n != null && Number.isFinite(n));
    const avgAmount =
      amounts.length > 0 ? roundMoney(amounts.reduce((s, n) => s + n, 0) / amounts.length) : 0;
    const avgMonthlyRate = (() => {
      const rates = jobs
        .map((j) => (j.monthly_rate != null ? Number(j.monthly_rate) : null))
        .filter((n): n is number => n != null && Number.isFinite(n));
      return rates.length > 0 ? roundMoney(rates.reduce((s, n) => s + n, 0) / rates.length) : 0;
    })();

    const marketValueStaged = roundMoney(
      active.reduce((s, j) => s + (j.market_value != null ? Number(j.market_value) : 0), 0),
    );
    const marketValueAllTime = roundMoney(
      jobs.reduce((s, j) => s + (j.market_value != null ? Number(j.market_value) : 0), 0),
    );

    // Monthly revenue — attribute completed jobs to destage/close month; open jobs to start month.
    const monthMap = new Map<string, { revenue: number; job_count: number; extensions: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(d.getUTCMonth() - i);
      monthMap.set(monthKey(d), { revenue: 0, job_count: 0, extensions: 0 });
    }
    for (const j of jobs) {
      const anchor =
        j.status === "completed"
          ? (j.destaged_at ?? j.actual_end_date ?? j.start_date)
          : j.start_date;
      const key = monthKey(new Date(anchor));
      const bucket = monthMap.get(key);
      if (!bucket) continue;
      bucket.revenue = roundMoney(bucket.revenue + jobRevenue(j));
      bucket.job_count += 1;
      bucket.extensions = roundMoney(
        bucket.extensions + (j.extension_amount != null ? Number(j.extension_amount) : 0),
      );
    }
    const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({
      month,
      revenue: v.revenue,
      job_count: v.job_count,
      extensions: v.extensions,
    }));

    const clientMap = new Map<string, { revenue: number; job_count: number; market_value: number }>();
    for (const j of jobs) {
      const cur = clientMap.get(j.client_name) ?? { revenue: 0, job_count: 0, market_value: 0 };
      cur.revenue = roundMoney(cur.revenue + jobRevenue(j));
      cur.job_count += 1;
      cur.market_value = roundMoney(
        cur.market_value + (j.market_value != null ? Number(j.market_value) : 0),
      );
      clientMap.set(j.client_name, cur);
    }
    const topClients = Array.from(clientMap.entries())
      .map(([client_name, v]) => ({ client_name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const jobsWithAmount = jobs.filter((j) => j.amount != null || j.total_paid != null).length;
    const jobsWithMarketValue = jobs.filter((j) => j.market_value != null).length;

    return res.json({
      collected_revenue: collected,
      pipeline_revenue: pipeline,
      total_revenue: roundMoney(collected + pipeline),
      extension_revenue: extensionRevenue,
      avg_amount: avgAmount,
      avg_monthly_rate: avgMonthlyRate,
      market_value_staged: marketValueStaged,
      market_value_all_time: marketValueAllTime,
      jobs_with_amount: jobsWithAmount,
      jobs_with_market_value: jobsWithMarketValue,
      job_count: jobs.length,
      monthly,
      top_clients: topClients,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /stats/reports/demand ───────────────────────────────────────────────

router.get("/reports/demand", async (_req, res) => {
  try {
    const [items, jobItems] = await Promise.all([
      prisma.item.findMany({
        where: { status: { not: "disposed" } },
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          status: true,
          purchase_cost: true,
          _count: { select: { job_items: true } },
        },
      }),
      prisma.jobItem.findMany({
        select: {
          item_id: true,
          assigned_at: true,
          item: { select: { category: true } },
        },
      }),
    ]);

    const categoryMap = new Map<
      string,
      { assignments: number; item_count: number; staged: number; available: number }
    >();
    for (const item of items) {
      const cur = categoryMap.get(item.category) ?? {
        assignments: 0,
        item_count: 0,
        staged: 0,
        available: 0,
      };
      cur.item_count += 1;
      cur.assignments += item._count.job_items;
      if (item.status === "staged") cur.staged += 1;
      if (item.status === "available") cur.available += 1;
      categoryMap.set(item.category, cur);
    }
    // Also count historical assignments from job_items in case of disposed items — already on live items via _count.

    const byCategory = Array.from(categoryMap.entries())
      .map(([category, v]) => ({
        category,
        assignments: v.assignments,
        item_count: v.item_count,
        staged: v.staged,
        available: v.available,
        avg_jobs_per_item:
          v.item_count > 0 ? Math.round((v.assignments / v.item_count) * 10) / 10 : 0,
        utilization_pct:
          v.item_count > 0 ? Math.round((v.staged / v.item_count) * 100) : 0,
      }))
      .sort((a, b) => b.assignments - a.assignments);

    const topItems = [...items]
      .sort((a, b) => b._count.job_items - a._count.job_items)
      .slice(0, 10)
      .map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        category: i.category,
        status: i.status,
        job_count: i._count.job_items,
        purchase_cost: Number(i.purchase_cost),
      }));

    // High demand + scarce availability: many past jobs, currently mostly staged
    const tightSupply = [...items]
      .filter((i) => i._count.job_items >= 2)
      .map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        category: i.category,
        status: i.status,
        job_count: i._count.job_items,
      }))
      .filter((i) => i.status === "staged" || i.status === "missing")
      .sort((a, b) => b.job_count - a.job_count)
      .slice(0, 8);

    // Monthly assignment volume by category (last 6 months)
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(d.getUTCMonth() - i);
      monthKeys.push(monthKey(d));
    }
    const monthlyCat = new Map<string, Map<string, number>>();
    for (const key of monthKeys) monthlyCat.set(key, new Map());
    for (const ji of jobItems) {
      const key = monthKey(new Date(ji.assigned_at));
      const bucket = monthlyCat.get(key);
      if (!bucket) continue;
      const cat = ji.item.category;
      bucket.set(cat, (bucket.get(cat) ?? 0) + 1);
    }
    // Keep top 5 categories overall for the trend series
    const topCatNames = byCategory.slice(0, 5).map((c) => c.category);
    const monthly_by_category = monthKeys.map((month) => {
      const bucket = monthlyCat.get(month) ?? new Map();
      const counts: Record<string, number> = {};
      for (const cat of topCatNames) counts[cat] = bucket.get(cat) ?? 0;
      return { month, counts };
    });

    return res.json({
      by_category: byCategory,
      top_items: topItems,
      tight_supply: tightSupply,
      monthly_by_category,
      top_category_names: topCatNames,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /stats/reports/activity ─────────────────────────────────────────────

router.get("/reports/activity", async (_req, res) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { status: { not: "cancelled" } },
      select: {
        start_date: true,
        expected_end_date: true,
        actual_end_date: true,
        destaged_at: true,
        status: true,
        amount: true,
        extension_amount: true,
        total_paid: true,
        market_value: true,
      },
    });

    // Build a 371-day window (~53 weeks) ending today (UTC), aligned to Sunday start.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = today;
    const start = addUtcDays(end, -370);
    // Align start to Sunday (UTC day 0)
    const startAligned = addUtcDays(start, -start.getUTCDay());

    type DayBucket = { date: string; staged: number; destaged: number; revenue: number };
    const dayMap = new Map<string, DayBucket>();
    for (let d = new Date(startAligned); d <= end; d = addUtcDays(d, 1)) {
      const key = dayKey(d);
      dayMap.set(key, { date: key, staged: 0, destaged: 0, revenue: 0 });
    }

    const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      staged: 0,
      destaged: 0,
    }));

    for (const j of jobs) {
      const startKey = dayKey(new Date(j.start_date));
      const startBucket = dayMap.get(startKey);
      if (startBucket) {
        startBucket.staged += 1;
        startBucket.revenue = roundMoney(startBucket.revenue + jobRevenue(j));
      }
      const startWd = new Date(j.start_date).getUTCDay();
      byWeekday[startWd].staged += 1;

      const destageDate = j.destaged_at ?? j.actual_end_date;
      if (destageDate) {
        const destageKey = dayKey(new Date(destageDate));
        const destageBucket = dayMap.get(destageKey);
        if (destageBucket) destageBucket.destaged += 1;
        byWeekday[new Date(destageDate).getUTCDay()].destaged += 1;
      }
    }

    const heatmap = Array.from(dayMap.values());
    const maxActivity = Math.max(...heatmap.map((d) => d.staged + d.destaged), 1);

    // Monthly staged vs destaged (last 12 months)
    const monthMap = new Map<string, { staged: number; destaged: number; revenue: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(d.getUTCMonth() - i);
      monthMap.set(monthKey(d), { staged: 0, destaged: 0, revenue: 0 });
    }
    for (const j of jobs) {
      const sKey = monthKey(new Date(j.start_date));
      const sBucket = monthMap.get(sKey);
      if (sBucket) {
        sBucket.staged += 1;
        sBucket.revenue = roundMoney(sBucket.revenue + jobRevenue(j));
      }
      const destageDate = j.destaged_at ?? j.actual_end_date;
      if (destageDate) {
        const dKey = monthKey(new Date(destageDate));
        const dBucket = monthMap.get(dKey);
        if (dBucket) dBucket.destaged += 1;
      }
    }

    const busiest = [...heatmap]
      .filter((d) => d.staged + d.destaged > 0)
      .sort((a, b) => b.staged + b.destaged - (a.staged + a.destaged))
      .slice(0, 5);

    const currentlyStaged = jobs.filter((j) => j.status === "active" || j.status === "planning").length;
    const destagedCount = jobs.filter((j) => j.destaged_at != null || j.status === "completed").length;

    return res.json({
      heatmap,
      max_activity: maxActivity,
      by_weekday: byWeekday,
      monthly: Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v })),
      busiest_days: busiest,
      currently_staged: currentlyStaged,
      destaged_count: destagedCount,
      range_start: dayKey(startAligned),
      range_end: dayKey(end),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
