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
    const totalItems     = availableCount + stagedCount;

    // Damaged items count
    const needsAttention = await prisma.item.count({
      where: { condition: "damaged", status: { not: "disposed" } },
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

export default router;
