import { Router } from "express";
import { ItemStatus, Prisma } from "@prisma/client";
import { rawPrisma } from "../lib/prisma";
import { PLATFORM_ORG_SLUG } from "../lib/platformAdmin";
import { authenticate } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/role";

/**
 * Platform-admin views across every organization. Read-only. These are the
 * only authenticated routes that deliberately use `rawPrisma`: the whole point
 * is to see past the caller's own tenant.
 */
const router = Router();
router.use(authenticate, requirePlatformAdmin);

/** Turns a Prisma groupBy result into { [org_id]: count }. */
function countsByOrg(rows: { org_id: string; _count: { _all: number } }[]) {
  return Object.fromEntries(rows.map((r) => [r.org_id, r._count._all]));
}

// ─── GET /admin/organizations ───────────────────────────────────────────────

router.get("/organizations", async (_req, res) => {
  try {
    const [orgs, activeJobs, lastMovements] = await Promise.all([
      // The platform org holds only admins and never any furniture; it isn't a customer.
      rawPrisma.organization.findMany({
        where: { slug: { not: PLATFORM_ORG_SLUG } },
        orderBy: { created_at: "asc" },
        include: { _count: { select: { users: true, items: true, jobs: true } } },
      }),
      rawPrisma.job.groupBy({ by: ["org_id"], where: { status: "active" }, _count: { _all: true } }),
      rawPrisma.movement.groupBy({ by: ["org_id"], _max: { created_at: true } }),
    ]);

    const activeByOrg = countsByOrg(activeJobs);
    const lastActivityByOrg = Object.fromEntries(lastMovements.map((m) => [m.org_id, m._max.created_at]));

    return res.json(
      orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        is_active: o.is_active,
        created_at: o.created_at,
        user_count: o._count.users,
        item_count: o._count.items,
        job_count: o._count.jobs,
        active_job_count: activeByOrg[o.id] ?? 0,
        last_activity_at: lastActivityByOrg[o.id] ?? null,
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /admin/organizations/:id ───────────────────────────────────────────

router.get("/organizations/:id", async (req, res) => {
  try {
    const org = await rawPrisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        users: {
          orderBy: { created_at: "asc" },
          select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
        },
      },
    });
    if (!org) return res.status(404).json({ message: "Organization not found" });

    const where = { org_id: org.id };
    const [itemsByStatus, jobsByStatus, lastMovement] = await Promise.all([
      rawPrisma.item.groupBy({ by: ["status"], where, _count: { _all: true } }),
      rawPrisma.job.groupBy({ by: ["status"], where, _count: { _all: true } }),
      rawPrisma.movement.findFirst({ where, orderBy: { created_at: "desc" }, select: { created_at: true } }),
    ]);

    return res.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      invite_code: org.invite_code,
      is_active: org.is_active,
      created_at: org.created_at,
      last_activity_at: lastMovement?.created_at ?? null,
      items_by_status: Object.fromEntries(itemsByStatus.map((r) => [r.status, r._count._all])),
      jobs_by_status: Object.fromEntries(jobsByStatus.map((r) => [r.status, r._count._all])),
      users: org.users,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /admin/items ───────────────────────────────────────────────────────
// Furniture across every org (or one, with ?org_id=). Optional ?search= (name
// or SKU) and ?status=. Capped at ?limit= (default 200, max 500), newest
// first; `total` is the full match count so the client can say "showing N of M".

const ITEM_STATUSES: ItemStatus[] = ["available", "staged", "disposed", "missing"];

router.get("/items", async (req, res) => {
  try {
    const { org_id, search, status, limit } = req.query as Record<string, string | undefined>;

    const where: Prisma.ItemWhereInput = {};
    if (org_id) where.org_id = org_id;
    if (status && ITEM_STATUSES.includes(status as ItemStatus)) where.status = status as ItemStatus;
    const q = search?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ];
    }

    const parsed = Number.parseInt(limit ?? "", 10);
    const take = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 200;

    const [items, total] = await Promise.all([
      rawPrisma.item.findMany({
        where,
        orderBy: { created_at: "desc" },
        take,
        select: {
          id: true, sku: true, name: true, category: true, status: true, condition: true,
          photo_url: true, purchase_cost: true, created_at: true,
          org: { select: { id: true, name: true } },
          set: { select: { id: true, name: true } },
        },
      }),
      rawPrisma.item.count({ where }),
    ]);

    return res.json({ items, total });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
