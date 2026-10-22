import { Router } from "express";
import { ItemStatus, JobStatus, Prisma, Role } from "@prisma/client";
import { rawPrisma } from "../lib/prisma";
import {
  PLATFORM_ORG_SLUG, newInviteCode, signActingToken, uniqueSlug,
} from "../lib/platformAdmin";
import { authenticate } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/role";

/**
 * Platform-admin views and controls across every organization. These are the
 * only authenticated routes that deliberately use `rawPrisma`: the whole point
 * is to see past the caller's own tenant. Changes *inside* an org (items, jobs,
 * scans) don't live here: the admin enters the org (POST /organizations/:id/act)
 * and uses the normal routes, so every rule and history record still applies.
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

// ─── Org management ─────────────────────────────────────────────────────────

const orgSummary = (o: { id: string; name: string; slug: string; invite_code: string; is_active: boolean; created_at: Date }) => ({
  id: o.id, name: o.name, slug: o.slug, invite_code: o.invite_code, is_active: o.is_active, created_at: o.created_at,
});

/** Loads a customer org, or sends 404/400 and returns null. The platform org is off limits. */
async function findCustomerOrg(id: string, res: import("express").Response) {
  const org = await rawPrisma.organization.findUnique({ where: { id } });
  if (!org) {
    res.status(404).json({ message: "Organization not found" });
    return null;
  }
  if (org.slug === PLATFORM_ORG_SLUG) {
    res.status(400).json({ message: "The platform organization can't be changed here" });
    return null;
  }
  return org;
}

// POST /admin/organizations { name }
router.post("/organizations", async (req, res) => {
  try {
    const name = (req.body?.name as string | undefined)?.trim();
    if (!name || name.length < 2 || name.length > 100) {
      return res.status(400).json({ message: "Name must be 2–100 characters" });
    }
    const org = await rawPrisma.organization.create({
      data: { name, slug: await uniqueSlug(name), invite_code: newInviteCode(name), is_active: true },
    });
    return res.status(201).json(orgSummary(org));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// PATCH /admin/organizations/:id { name?, is_active? }
// Deactivating blocks new sign-ups with the invite code; existing users keep working.
router.patch("/organizations/:id", async (req, res) => {
  try {
    const org = await findCustomerOrg(req.params.id, res);
    if (!org) return;

    const { name, is_active } = req.body as { name?: string; is_active?: boolean };
    const trimmed = name?.trim();
    if (name !== undefined && (!trimmed || trimmed.length < 2 || trimmed.length > 100)) {
      return res.status(400).json({ message: "Name must be 2–100 characters" });
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return res.status(400).json({ message: "is_active must be true or false" });
    }

    const updated = await rawPrisma.organization.update({
      where: { id: org.id },
      data: { ...(trimmed && { name: trimmed }), ...(is_active !== undefined && { is_active }) },
    });
    return res.json(orgSummary(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /admin/organizations/:id/invite-code — the old code stops working.
router.post("/organizations/:id/invite-code", async (req, res) => {
  try {
    const org = await findCustomerOrg(req.params.id, res);
    if (!org) return;
    const updated = await rawPrisma.organization.update({
      where: { id: org.id },
      data: { invite_code: newInviteCode(org.name) },
    });
    return res.json(orgSummary(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /admin/organizations/:id/act → { token, org }
// A short-lived manager token scoped to this org, for the admin to use its
// normal screens. Works on inactive orgs too, so they can be fixed up.
router.post("/organizations/:id/act", async (req, res) => {
  try {
    const org = await findCustomerOrg(req.params.id, res);
    if (!org) return;
    const token = signActingToken({ id: req.user!.userId, email: req.user!.email }, org.id);
    return res.json({ token, org: { id: org.id, name: org.name } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── Users in any org ───────────────────────────────────────────────────────

// PATCH /admin/users/:id { role?, is_active?, org_id? }
// Moving a user leaves the jobs and scans they recorded in their old org.
// Platform admins (and yourself) are managed with `npm run admin:setup`, not here.
router.patch("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.user!.userId) {
      return res.status(400).json({ message: "You can't change your own account here" });
    }
    const user = await rawPrisma.user.findUnique({ where: { id: req.params.id }, include: { org: true } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.org.slug === PLATFORM_ORG_SLUG) {
      return res.status(400).json({ message: "Platform admins can't be changed here" });
    }

    const { role, is_active, org_id } = req.body as { role?: string; is_active?: boolean; org_id?: string };
    if (role !== undefined && role !== "staff" && role !== "manager") {
      return res.status(400).json({ message: "role must be staff or manager" });
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return res.status(400).json({ message: "is_active must be true or false" });
    }
    if (org_id !== undefined) {
      const target = await rawPrisma.organization.findUnique({ where: { id: org_id } });
      if (!target) return res.status(404).json({ message: "Organization not found" });
      if (target.slug === PLATFORM_ORG_SLUG) {
        return res.status(400).json({ message: "Users can't be moved into the platform organization" });
      }
    }

    const updated = await rawPrisma.user.update({
      where: { id: user.id },
      data: {
        ...(role !== undefined && { role: role as Role }),
        ...(is_active !== undefined && { is_active }),
        ...(org_id !== undefined && { org_id }),
      },
      include: { org: { select: { id: true, name: true } } },
    });
    return res.json({
      id: updated.id, name: updated.name, email: updated.email, role: updated.role,
      is_active: updated.is_active, created_at: updated.created_at, org: updated.org,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /admin/jobs ────────────────────────────────────────────────────────
// Jobs across every org (or one, with ?org_id=). Optional ?status= and
// ?search= (address, city, client). Same limit/total shape as /admin/items.

const JOB_STATUSES: JobStatus[] = ["planning", "active", "completed", "cancelled"];

router.get("/jobs", async (req, res) => {
  try {
    const { org_id, search, status, limit } = req.query as Record<string, string | undefined>;

    const where: Prisma.JobWhereInput = {};
    if (org_id) where.org_id = org_id;
    if (status && JOB_STATUSES.includes(status as JobStatus)) where.status = status as JobStatus;
    const q = search?.trim();
    if (q) {
      where.OR = [
        { address: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { client_name: { contains: q, mode: "insensitive" } },
      ];
    }

    const parsed = Number.parseInt(limit ?? "", 10);
    const take = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 200;

    const [jobs, total] = await Promise.all([
      rawPrisma.job.findMany({
        where,
        orderBy: [{ status: "asc" }, { expected_end_date: "asc" }],
        take,
        select: {
          id: true, address: true, city: true, state: true, client_name: true, status: true,
          start_date: true, expected_end_date: true, actual_end_date: true, created_at: true,
          org: { select: { id: true, name: true } },
          _count: { select: { job_items: true } },
        },
      }),
      rawPrisma.job.count({ where }),
    ]);

    return res.json({
      jobs: jobs.map(({ _count, ...j }) => ({ ...j, item_count: _count.job_items })),
      total,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
