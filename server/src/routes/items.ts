import { Router } from "express";
import { Prisma, ItemStatus, ItemCondition } from "@prisma/client";
import QRCode from "qrcode";
import { prisma, rawPrisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";
import {
  loadAssignedItem,
  returnItemFromJob,
  maybeCompleteJob,
  type ReturnCond,
} from "../lib/itemTransitions";

const router = Router();

// ─── GET /items/:id/qr  (public — SKU is on physical labels, no auth = no tenant context) ─

router.get("/:id/qr", async (req, res) => {
  try {
    const item = await rawPrisma.item.findUnique({
      where: { id: req.params.id },
      select: { sku: true },
    });
    if (!item) return res.status(404).json({ message: "Item not found" });

    const png = await QRCode.toBuffer(item.sku, {
      type: "png",
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(png);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// All routes below require authentication
router.use(authenticate);

// ─── SKU generation ──────────────────────────────────────────────────────────

async function generateSku(): Promise<string> {
  const last = await prisma.item.findFirst({
    where: { sku: { startsWith: "STG-ITM-" } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });
  const n = last ? parseInt(last.sku.replace("STG-ITM-", ""), 10) + 1 : 1;
  return `STG-ITM-${String(n).padStart(4, "0")}`;
}

// ─── GET /items ───────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { search, status, condition, category, set_id, qr_printed, is_unlabeled } = req.query as Record<string, string>;

    const where: Prisma.ItemWhereInput = {};

    const validStatuses: ItemStatus[] = ["available", "staged", "disposed", "missing"];
    if (status && validStatuses.includes(status as ItemStatus)) {
      where.status = status as ItemStatus;
    }

    const validConditions: ItemCondition[] = ["good", "fair", "damaged"];
    if (condition && validConditions.includes(condition as ItemCondition)) {
      where.condition = condition as ItemCondition;
    }

    if (category) {
      where.category = { equals: category, mode: "insensitive" };
    }

    if (set_id === "none") {
      where.set_id = null;
    } else if (set_id) {
      where.set_id = set_id;
    }

    if (qr_printed === "true") {
      where.qr_printed = true;
    } else if (qr_printed === "false") {
      where.qr_printed = false;
    }

    if (is_unlabeled === "true") {
      where.is_unlabeled = true;
    } else if (is_unlabeled === "false") {
      where.is_unlabeled = false;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: {
        set: { select: { id: true, name: true } },
        // Same filter the assign route uses to detect "already on a job":
        // anything not yet returned counts as an active assignment.
        job_items: {
          where: { status: { not: "returned" } },
          select: { job_id: true },
        },
      },
      orderBy: { created_at: "desc" },
    });

    // Flatten to active_job_id so clients can tell an "available" item is
    // already planned onto a job (items stay available until scan-out).
    const rows = items.map(({ job_items, ...item }) => ({
      ...item,
      active_job_id: job_items[0]?.job_id ?? null,
    }));

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items ──────────────────────────────────────────────────────────────

router.post("/", requireManager, async (req, res) => {
  try {
    const { name, category, set_id, purchase_cost, purchase_date, notes, photo_url, width_in, depth_in, height_in } =
      req.body as {
        name?: string;
        category?: string;
        set_id?: string;
        purchase_cost?: number;
        purchase_date?: string;
        notes?: string;
        photo_url?: string;
        width_in?: number;
        depth_in?: number;
        height_in?: number;
      };

    if (!name?.trim() || !category) {
      return res.status(400).json({ message: "name and category are required" });
    }

    const sku = await generateSku();

    const item = await prisma.item.create({
      data: {
        org_id: req.user!.org_id,
        sku,
        name: name.trim(),
        category,
        set_id: set_id || null,
        purchase_cost: purchase_cost ?? 0,
        purchase_date: purchase_date ? new Date(purchase_date) : null,
        width_in: width_in ?? null,
        depth_in: depth_in ?? null,
        height_in: height_in ?? null,
        notes: notes || null,
        photo_url: photo_url || null,
      },
      include: { set: { select: { id: true, name: true } } },
    });

    return res.status(201).json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items/import ───────────────────────────────────────────────────────

router.post("/import", requireManager, async (req, res) => {
  try {
    const { items } = req.body as {
      items?: Array<{
        name?: string;
        category?: string;
        purchase_cost?: number;
        purchase_date?: string;
        width_in?: number;
        depth_in?: number;
        height_in?: number;
        notes?: string;
      }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items array is required" });
    }

    const created: string[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (!row.name?.trim() || !row.category) {
        errors.push({ row: i + 1, message: "name and category are required" });
        continue;
      }
      try {
        const sku = await generateSku();
        const item = await prisma.item.create({
          data: {
            org_id: req.user!.org_id,
            sku,
            name: row.name.trim(),
            category: row.category,
            purchase_cost: row.purchase_cost ?? 0,
            purchase_date: row.purchase_date ? new Date(row.purchase_date) : null,
            width_in: row.width_in ?? null,
            depth_in: row.depth_in ?? null,
            height_in: row.height_in ?? null,
            notes: row.notes || null,
          },
        });
        created.push(item.id);
      } catch {
        errors.push({ row: i + 1, message: "Failed to create item" });
      }
    }

    return res.status(201).json({ created: created.length, errors });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items/bulk-unlabeled ───────────────────────────────────────────────
// Create N placeholder items (SKU + QR only) for pre-printing labels before
// details are known. Managers fill in name/category later via edit / quick scan.

router.post("/bulk-unlabeled", requireManager, async (req, res) => {
  try {
    const count = Number((req.body as { count?: number })?.count);
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      return res.status(400).json({ message: "count must be an integer between 1 and 200" });
    }

    const items = [];
    for (let i = 0; i < count; i++) {
      const sku = await generateSku();
      const item = await prisma.item.create({
        data: {
          org_id: req.user!.org_id,
          sku,
          name: "Red Dot Home Services",
          category: "Other",
          purchase_cost: 0,
          purchase_date: null,
          notes: "Placeholder — fill in details after sticking the QR label",
          is_unlabeled: true,
        },
        include: { set: { select: { id: true, name: true } } },
      });
      items.push(item);
    }

    return res.status(201).json({ created: items.length, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /items/sku/:sku — look up by exact SKU (for QR scanner) ─────────────

router.get("/sku/:sku", async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
      where: { org_id_sku: { org_id: req.user!.org_id, sku: req.params.sku } },
      include: { set: { select: { id: true, name: true } } },
    });
    if (!item) return res.status(404).json({ message: "Item not found" });
    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /items/:id ───────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
      include: {
        set: { select: { id: true, name: true } },
        job_items: {
          where: {
            status: { in: ["assigned", "loaded", "delivered", "picked_up"] },
          },
          include: {
            job: {
              select: {
                id: true,
                address: true,
                city: true,
                state: true,
                client_name: true,
                start_date: true,
              },
            },
          },
          take: 1,
          orderBy: { assigned_at: "desc" },
        },
      },
    });

    if (!item) return res.status(404).json({ message: "Item not found" });

    const { job_items, ...rest } = item;
    return res.json({ ...rest, current_job: job_items[0]?.job ?? null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── PUT /items/:id ───────────────────────────────────────────────────────────

router.put("/:id", requireManager, async (req, res) => {
  try {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Item not found" });

    const { name, category, set_id, condition, notes, photo_url, purchase_cost, purchase_date, width_in, depth_in, height_in, qr_printed } =
      req.body as Partial<{
        name: string;
        category: string;
        set_id: string | null;
        condition: ItemCondition;
        notes: string | null;
        photo_url: string | null;
        purchase_cost: number;
        purchase_date: string | null;
        width_in: number | null;
        depth_in: number | null;
        height_in: number | null;
        qr_printed: boolean;
      }>;

    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(category !== undefined && { category }),
        ...(set_id !== undefined && { set_id: set_id || null }),
        ...(condition !== undefined && { condition }),
        ...(notes !== undefined && { notes }),
        ...(photo_url !== undefined && { photo_url }),
        ...(purchase_cost !== undefined && { purchase_cost }),
        ...(purchase_date !== undefined && {
          purchase_date: purchase_date ? new Date(purchase_date) : null,
        }),
        ...(width_in !== undefined && { width_in }),
        ...(depth_in !== undefined && { depth_in }),
        ...(height_in !== undefined && { height_in }),
        ...(qr_printed !== undefined && { qr_printed: Boolean(qr_printed) }),
        // Editing details on a blank sticker claims it
        ...(existing.is_unlabeled && name !== undefined && category !== undefined && {
          is_unlabeled: false,
        }),
      },
      include: { set: { select: { id: true, name: true } } },
    });

    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items/:id/dispose ──────────────────────────────────────────────────
// Soft-remove from active inventory (status → disposed). Record stays for history.

router.post("/:id/dispose", requireManager, async (req, res) => {
  try {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Item not found" });
    if (existing.status === "disposed") {
      return res.status(400).json({ message: "Item is already disposed" });
    }
    if (existing.status === "staged") {
      return res.status(400).json({ message: "Cannot dispose an item that is currently staged — return it first" });
    }

    const userId = req.user!.userId;
    const [item] = await prisma.$transaction([
      prisma.item.update({
        where: { id: req.params.id },
        data: { status: "disposed" },
        include: { set: { select: { id: true, name: true } } },
      }),
      prisma.movement.create({
        data: {
          org_id: req.user!.org_id,
          item_id: req.params.id,
          job_id: null,
          from_status: existing.status,
          to_status: "disposed",
          performed_by: userId,
          notes: "Disposed — removed from active inventory",
        },
      }),
    ]);

    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── DELETE /items/:id ────────────────────────────────────────────────────────
// Permanently deletes the item and its history. Blocked while staged.

router.delete("/:id", requireManager, async (req, res) => {
  try {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Item not found" });
    if (existing.status === "staged") {
      return res.status(400).json({ message: "Cannot delete an item that is currently staged — return it first" });
    }

    await prisma.$transaction([
      prisma.movement.deleteMany({ where: { item_id: req.params.id } }),
      prisma.jobItem.deleteMany({ where: { item_id: req.params.id } }),
      prisma.item.delete({ where: { id: req.params.id } }),
    ]);

    return res.json({ message: "Item deleted", id: req.params.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items/:id/found ─────────────────────────────────────────────────────
// Resolves an item that was marked missing (e.g. a force-completed job) back
// into available inventory. Condition is left as-is — edit the item afterward
// if it came back damaged.

router.post("/:id/found", requireManager, async (req, res) => {
  try {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Item not found" });
    if (existing.status !== "missing") {
      return res.status(400).json({ message: "Item is not marked missing" });
    }

    const userId = req.user!.userId;

    const [item] = await prisma.$transaction([
      prisma.item.update({
        where: { id: req.params.id },
        data: { status: "available" },
        include: { set: { select: { id: true, name: true } } },
      }),
      prisma.movement.create({
        data: {
          org_id: req.user!.org_id,
          item_id: req.params.id,
          job_id: null,
          from_status: "missing",
          to_status: "available",
          performed_by: userId,
          notes: "Found — marked available",
        },
      }),
    ]);

    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /items/:id/movements ─────────────────────────────────────────────────

router.get("/:id/movements", async (req, res) => {
  try {
    const exists = await prisma.item.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!exists) return res.status(404).json({ message: "Item not found" });

    const movements = await prisma.movement.findMany({
      where: { item_id: req.params.id },
      include: {
        performer: { select: { name: true } },
        job: { select: { address: true, city: true, state: true } },
      },
      orderBy: { created_at: "desc" },
    });

    return res.json(movements);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items/:id/claim ───────────────────────────────────────────────────
// Fill in details for a pre-printed blank QR sticker. Staff or manager.
// Clears is_unlabeled once name + category are set.

router.post("/:id/claim", async (req, res) => {
  try {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Item not found" });
    if (!existing.is_unlabeled) {
      return res.status(400).json({ message: "Item is already claimed — edit it instead" });
    }

    const body = req.body as Partial<{
      name: string;
      category: string;
      set_id: string | null;
      notes: string | null;
      photo_url: string | null;
      purchase_cost: number;
      purchase_date: string | null;
      width_in: number | null;
      depth_in: number | null;
      height_in: number | null;
      condition: ItemCondition;
      job_id: string | null;
    }>;

    if (!body.name?.trim() || !body.category?.trim()) {
      return res.status(400).json({ message: "name and category are required" });
    }

    let assignJobId: string | null = null;
    if (body.job_id) {
      const job = await prisma.job.findUnique({ where: { id: body.job_id } });
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== "planning" && job.status !== "active") {
        return res.status(400).json({ message: "Can only assign to planning or active jobs" });
      }
      assignJobId = job.id;
    }

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({
        where: { id: req.params.id },
        data: {
          name: body.name!.trim(),
          category: body.category!.trim(),
          is_unlabeled: false,
          notes: body.notes !== undefined ? body.notes : null,
          ...(body.set_id !== undefined && { set_id: body.set_id || null }),
          ...(body.photo_url !== undefined && { photo_url: body.photo_url }),
          ...(body.purchase_cost !== undefined && { purchase_cost: body.purchase_cost }),
          ...(body.purchase_date !== undefined && {
            purchase_date: body.purchase_date ? new Date(body.purchase_date) : null,
          }),
          ...(body.width_in !== undefined && { width_in: body.width_in }),
          ...(body.depth_in !== undefined && { depth_in: body.depth_in }),
          ...(body.height_in !== undefined && { height_in: body.height_in }),
          ...(body.condition !== undefined && { condition: body.condition }),
        },
        include: { set: { select: { id: true, name: true } } },
      });

      if (assignJobId) {
        const openAssignment = await tx.jobItem.findFirst({
          where: { item_id: updated.id, status: { not: "returned" } },
          select: { id: true, job_id: true },
        });
        if (openAssignment && openAssignment.job_id !== assignJobId) {
          throw Object.assign(new Error("Item is already assigned to another job"), { status: 400 });
        }
        if (!openAssignment) {
          await tx.jobItem.create({
            data: {
              org_id: req.user!.org_id,
              job_id: assignJobId,
              item_id: updated.id,
              status: "assigned",
            },
          });
        }
      }

      return updated;
    });

    return res.json(item);
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 400) {
      return res.status(400).json({ message: (err as Error).message });
    }
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items/:id/duplicate ───────────────────────────────────────────────
// Create another copy with a new SKU. Copies description fields + photo;
// leaves purchase cost/date blank; starts available and unlabeled=false.

router.post("/:id/duplicate", requireManager, async (req, res) => {
  try {
    const source = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!source) return res.status(404).json({ message: "Item not found" });

    const sku = await generateSku();
    const item = await prisma.item.create({
      data: {
        org_id: req.user!.org_id,
        sku,
        name: source.name,
        category: source.category,
        set_id: source.set_id,
        condition: "good",
        status: "available",
        photo_url: source.photo_url,
        purchase_cost: 0,
        purchase_date: null,
        width_in: source.width_in,
        depth_in: source.depth_in,
        height_in: source.height_in,
        notes: source.notes,
        qr_printed: false,
        is_unlabeled: false,
      },
      include: { set: { select: { id: true, name: true } } },
    });

    return res.status(201).json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items/:id/set-status ──────────────────────────────────────────────
// Manager override: change item status without scanning. Keeps job_items in sync.

router.post("/:id/set-status", requireManager, async (req, res) => {
  try {
    const { status, condition, notes, job_id } = req.body as {
      status?: ItemStatus;
      condition?: ReturnCond | ItemCondition;
      notes?: string;
      job_id?: string;
    };

    const valid: ItemStatus[] = ["available", "staged", "missing", "disposed"];
    if (!status || !valid.includes(status)) {
      return res.status(400).json({ message: "status must be available, staged, missing, or disposed" });
    }

    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Item not found" });
    if (existing.status === status) {
      return res.status(400).json({ message: `Item is already ${status}` });
    }

    const openJobItem = await prisma.jobItem.findFirst({
      where: { item_id: req.params.id, status: { not: "returned" } },
      include: { job: { select: { id: true, status: true } } },
    });

    const userId = req.user!.userId;
    const orgId = req.user!.org_id;
    const movementNote = notes?.trim() || "Manual status override";

    if (status === "staged") {
      const targetJobId = job_id || openJobItem?.job_id;
      if (!targetJobId) {
        return res.status(400).json({ message: "job_id is required to mark an item staged" });
      }
      if (openJobItem && openJobItem.job_id !== targetJobId) {
        return res.status(400).json({ message: "Item is already on a different job" });
      }

      const job = await prisma.job.findUnique({ where: { id: targetJobId } });
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.status !== "planning" && job.status !== "active") {
        return res.status(400).json({ message: "Job must be planning or active" });
      }

      await prisma.$transaction(async (tx) => {
        let jobItemId = openJobItem?.id;
        if (!jobItemId) {
          const created = await tx.jobItem.create({
            data: { org_id: orgId, job_id: targetJobId, item_id: req.params.id, status: "assigned" },
          });
          jobItemId = created.id;
        } else if (openJobItem!.status !== "assigned" && openJobItem!.status !== "loaded") {
          // already loaded-ish — just ensure item is staged
        }

        const ji = await tx.jobItem.findUnique({ where: { id: jobItemId } });
        if (ji && ji.status === "assigned") {
          await loadAssignedItem(tx, {
            orgId,
            jobId: targetJobId,
            itemId: req.params.id,
            jobItemId,
            userId,
            activateJob: job.status === "planning",
            notes: movementNote,
          });
        } else {
          await tx.item.update({ where: { id: req.params.id }, data: { status: "staged" } });
          await tx.movement.create({
            data: {
              org_id: orgId,
              item_id: req.params.id,
              job_id: targetJobId,
              from_status: existing.status,
              to_status: "staged",
              performed_by: userId,
              notes: movementNote,
            },
          });
        }
      });
    } else if (status === "available") {
      await prisma.$transaction(async (tx) => {
        if (openJobItem) {
          if (openJobItem.status === "assigned") {
            await tx.jobItem.delete({ where: { id: openJobItem.id } });
            await tx.item.update({ where: { id: req.params.id }, data: { status: "available" } });
            await tx.movement.create({
              data: {
                org_id: orgId,
                item_id: req.params.id,
                job_id: openJobItem.job_id,
                from_status: existing.status,
                to_status: "available",
                performed_by: userId,
                notes: movementNote,
              },
            });
          } else {
            const returnCond = (["good", "damaged", "dispose"].includes(String(condition))
              ? condition
              : "good") as ReturnCond;
            await returnItemFromJob(tx, {
              orgId,
              jobId: openJobItem.job_id,
              itemId: req.params.id,
              jobItemId: openJobItem.id,
              userId,
              condition: returnCond,
              notes: notes ?? null,
              movementNotes: movementNote,
            });
            await maybeCompleteJob(tx, openJobItem.job_id);
          }
        } else {
          await tx.item.update({ where: { id: req.params.id }, data: { status: "available" } });
          await tx.movement.create({
            data: {
              org_id: orgId,
              item_id: req.params.id,
              from_status: existing.status,
              to_status: "available",
              performed_by: userId,
              notes: movementNote,
            },
          });
        }
      });
    } else if (status === "missing") {
      await prisma.$transaction(async (tx) => {
        if (openJobItem) {
          await tx.jobItem.update({ where: { id: openJobItem.id }, data: { status: "missing" } });
        }
        await tx.item.update({ where: { id: req.params.id }, data: { status: "missing" } });
        await tx.movement.create({
          data: {
            org_id: orgId,
            item_id: req.params.id,
            job_id: openJobItem?.job_id ?? null,
            from_status: existing.status,
            to_status: "missing",
            performed_by: userId,
            notes: movementNote,
          },
        });
      });
    } else if (status === "disposed") {
      if (existing.status === "staged" || openJobItem?.status === "loaded") {
        // Close out the job row first, then dispose
        await prisma.$transaction(async (tx) => {
          if (openJobItem) {
            await returnItemFromJob(tx, {
              orgId,
              jobId: openJobItem.job_id,
              itemId: req.params.id,
              jobItemId: openJobItem.id,
              userId,
              condition: "dispose",
              notes: notes ?? null,
              movementNotes: movementNote,
            });
            await maybeCompleteJob(tx, openJobItem.job_id);
          } else {
            await tx.item.update({ where: { id: req.params.id }, data: { status: "disposed" } });
            await tx.movement.create({
              data: {
                org_id: orgId,
                item_id: req.params.id,
                from_status: existing.status,
                to_status: "disposed",
                performed_by: userId,
                notes: movementNote,
              },
            });
          }
        });
      } else if (openJobItem?.status === "assigned") {
        await prisma.$transaction(async (tx) => {
          await tx.jobItem.delete({ where: { id: openJobItem.id } });
          await tx.item.update({ where: { id: req.params.id }, data: { status: "disposed" } });
          await tx.movement.create({
            data: {
              org_id: orgId,
              item_id: req.params.id,
              job_id: openJobItem.job_id,
              from_status: existing.status,
              to_status: "disposed",
              performed_by: userId,
              notes: movementNote,
            },
          });
        });
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.item.update({ where: { id: req.params.id }, data: { status: "disposed" } });
          await tx.movement.create({
            data: {
              org_id: orgId,
              item_id: req.params.id,
              from_status: existing.status,
              to_status: "disposed",
              performed_by: userId,
              notes: movementNote,
            },
          });
        });
      }
    }

    const updated = await prisma.item.findUnique({
      where: { id: req.params.id },
      include: { set: { select: { id: true, name: true } } },
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
