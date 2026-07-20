import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

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

    // Active jobs count
    const activeJobsCount =
      (jobCounts.find((r) => r.status === "active")?._count  ?? 0) +
      (jobCounts.find((r) => r.status === "planning")?._count ?? 0);

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

    return res.json({
      total_completed:    totalCompleted,
      avg_duration_days:  avgDurationDays,
      on_time_rate_pct:   onTimeRatePct,
      damage_rate_pct:    damageRatePct,
      top_clients:        topClients,
      monthly_completions: monthlyCompletions,
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

export default router;
