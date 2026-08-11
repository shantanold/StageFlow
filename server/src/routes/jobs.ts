import { Router } from "express";
import { JobStatus, ItemStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";
import {
  loadAssignedItem,
  undoLoadItem,
  returnItemFromJob,
  maybeCompleteJob,
  type ReturnCond,
} from "../lib/itemTransitions";

const router = Router();
router.use(authenticate);

const validStatus: JobStatus[] = ["planning", "active", "completed", "cancelled"];

// ─── GET /jobs?status= ───────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { status } = req.query as { status?: string };

    const where: { status?: JobStatus } = {};
    const valid: JobStatus[] = ["planning", "active", "completed", "cancelled"];
    if (status && valid.includes(status as JobStatus)) {
      where.status = status as JobStatus;
    }

    const jobs = await prisma.job.findMany({
      where,
      orderBy: [{ status: "asc" }, { expected_end_date: "asc" }],
      include: {
        _count: { select: { job_items: true } },
      },
    });

    const result = jobs.map(({ _count, ...j }) => ({
      ...j,
      item_count: _count.job_items,
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs ───────────────────────────────────────────────────────────────

router.post("/", requireManager, async (req, res) => {
  try {
    const body = req.body as {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      client_name?: string;
      client_contact?: string;
      start_date?: string;
      expected_end_date?: string;
      notes?: string;
    };

    if (!body.address?.trim()) {
      return res.status(400).json({ message: "address is required" });
    }
    if (!body.client_name?.trim()) {
      return res.status(400).json({ message: "client_name is required" });
    }
    if (!body.start_date) {
      return res.status(400).json({ message: "start_date is required" });
    }
    if (!body.expected_end_date) {
      return res.status(400).json({ message: "expected_end_date is required" });
    }

    const userId = req.user!.userId;

    const job = await prisma.job.create({
      data: {
        org_id: req.user!.org_id,
        address: body.address.trim(),
        city: (body.city ?? "").trim() || "Pearland",
        state: (body.state ?? "").trim() || "TX",
        zip: (body.zip ?? "").trim(),
        client_name: body.client_name.trim(),
        client_contact: (body.client_contact ?? "").trim(),
        start_date: new Date(body.start_date),
        expected_end_date: new Date(body.expected_end_date),
        notes: body.notes?.trim() ?? null,
        status: "planning",
        created_by: userId,
      },
    });

    return res.status(201).json({ ...job, item_count: 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /jobs/:id ──────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { job_items: true } } },
    });
    if (!job) return res.status(404).json({ message: "Job not found" });

    const { _count, ...rest } = job;
    return res.json({ ...rest, item_count: _count.job_items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── PUT /jobs/:id ───────────────────────────────────────────────────────────

router.put("/:id", requireManager, async (req, res) => {
  try {
    const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Job not found" });

    const body = req.body as {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      client_name?: string;
      client_contact?: string;
      start_date?: string;
      expected_end_date?: string;
      actual_end_date?: string | null;
      status?: JobStatus;
      notes?: string;
    };

    const data: Record<string, unknown> = {};
    if (body.address !== undefined) data.address = body.address.trim();
    if (body.city !== undefined) data.city = body.city.trim();
    if (body.state !== undefined) data.state = body.state.trim();
    if (body.zip !== undefined) data.zip = body.zip.trim();
    if (body.client_name !== undefined) data.client_name = body.client_name.trim();
    if (body.client_contact !== undefined) data.client_contact = body.client_contact.trim();
    if (body.start_date !== undefined) data.start_date = new Date(body.start_date);
    if (body.expected_end_date !== undefined) data.expected_end_date = new Date(body.expected_end_date);
    if (body.actual_end_date !== undefined) data.actual_end_date = body.actual_end_date ? new Date(body.actual_end_date) : null;
    if (body.status !== undefined && validStatus.includes(body.status)) data.status = body.status;
    if (body.notes !== undefined) data.notes = body.notes?.trim() ?? null;

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data,
      include: { _count: { select: { job_items: true } } },
    });

    const { _count, ...rest } = job;
    return res.json({ ...rest, item_count: _count.job_items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /jobs/:id/items ──────────────────────────────────────────────────────

router.get("/:id/items", async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!job) return res.status(404).json({ message: "Job not found" });

    const jobItems = await prisma.jobItem.findMany({
      where: { job_id: req.params.id },
      include: {
        item: {
          include: { set: { select: { id: true, name: true } } },
        },
      },
      orderBy: { assigned_at: "asc" },
    });

    const result = jobItems.map((ji) => ({
      id: ji.id,
      job_id: ji.job_id,
      item_id: ji.item_id,
      status: ji.status,
      return_condition: ji.return_condition,
      return_notes: ji.return_notes,
      assigned_at: ji.assigned_at,
      returned_at: ji.returned_at,
      item: ji.item,
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/assign ───────────────────────────────────────────────────
// Adds items to the job and marks them staged immediately.

router.post("/:id/assign", requireManager, async (req, res) => {
  try {
    const jobId = req.params.id;
    const body = req.body as { itemIds?: string[] };
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : [];

    if (itemIds.length === 0) {
      return res.status(400).json({ message: "itemIds array is required and must not be empty" });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== "planning" && job.status !== "active") {
      return res.status(400).json({ message: "Can only assign items to planning or active jobs" });
    }

    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, status: true, is_unlabeled: true, name: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const missing = itemIds.filter((id) => !itemMap.has(id));
    if (missing.length > 0) {
      return res.status(400).json({ message: "Some items were not found", unavailableIds: missing });
    }

    const placeholders = itemIds.filter((id) => {
      const item = itemMap.get(id)!;
      return item.is_unlabeled || item.name.trim().toLowerCase() === "red dot home services";
    });
    if (placeholders.length > 0) {
      return res.status(400).json({
        message: "Blank / placeholder labels must be claimed before assigning to a job",
        unavailableIds: placeholders,
      });
    }

    const notAvailable = itemIds.filter((id) => itemMap.get(id)?.status !== "available");
    if (notAvailable.length > 0) {
      return res.status(400).json({
        message: "Some items are not unstaged / available to assign",
        unavailableIds: notAvailable,
      });
    }

    // Exclude items already assigned to ANY non-returned job
    const alreadyAssigned = await prisma.jobItem.findMany({
      where: {
        item_id: { in: itemIds },
        status: { not: "returned" },
      },
      select: { item_id: true, job_id: true },
    });
    const assignedElsewhere = alreadyAssigned
      .filter((a) => a.job_id !== jobId)
      .map((a) => a.item_id);
    if (assignedElsewhere.length > 0) {
      return res.status(400).json({ message: "Some items are already assigned to another job", unavailableIds: assignedElsewhere });
    }

    const alreadyOnJob = new Set(
      alreadyAssigned.filter((a) => a.job_id === jobId).map((a) => a.item_id)
    );
    const toAssign = itemIds.filter((id) => !alreadyOnJob.has(id));
    if (toAssign.length === 0) {
      return res.status(400).json({ message: "All selected items are already on this job" });
    }

    const orgId = req.user!.org_id;
    const userId = req.user!.userId;
    const activateJob = job.status === "planning";

    await prisma.$transaction(async (tx) => {
      for (const itemId of toAssign) {
        await tx.jobItem.create({
          data: { org_id: orgId, job_id: jobId, item_id: itemId, status: "loaded" },
        });
        await tx.item.update({
          where: { id: itemId },
          data: { status: "staged" },
        });
        await tx.movement.create({
          data: {
            org_id: orgId,
            item_id: itemId,
            job_id: jobId,
            from_status: "available",
            to_status: "staged",
            performed_by: userId,
            notes: "Assigned to job",
          },
        });
      }
      if (activateJob) {
        await tx.job.update({ where: { id: jobId }, data: { status: "active" } });
      }
    });

    const updated = await prisma.job.findUnique({
      where: { id: jobId },
      include: { _count: { select: { job_items: true } } },
    });
    return res.json({ ...updated, item_count: updated!._count.job_items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/unassign ─────────────────────────────────────────────────
// Removes items from the job and marks them unstaged again.

router.post("/:id/unassign", requireManager, async (req, res) => {
  try {
    const jobId = req.params.id;
    const body = req.body as { itemIds?: string[] };
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : [];

    if (itemIds.length === 0) {
      return res.status(400).json({ message: "itemIds array is required and must not be empty" });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== "planning" && job.status !== "active") {
      return res.status(400).json({ message: "Can only unassign items from planning or active jobs" });
    }

    const jobItems = await prisma.jobItem.findMany({
      where: { job_id: jobId, item_id: { in: itemIds } },
      select: { id: true, item_id: true, status: true },
    });
    const onJob = new Map(jobItems.map((ji) => [ji.item_id, ji]));

    const notOnJob = itemIds.filter((id) => !onJob.has(id));
    if (notOnJob.length > 0) {
      return res.status(400).json({
        message: "Some items are not on this job",
        unavailableIds: notOnJob,
      });
    }

    const notRemovable = jobItems.filter(
      (ji) => ji.status === "returned" || ji.status === "missing"
    );
    if (notRemovable.length > 0) {
      return res.status(400).json({
        message: "Some items have already been returned or marked missing — cannot unassign",
        unavailableIds: notRemovable.map((ji) => ji.item_id),
      });
    }

    const orgId = req.user!.org_id;
    const userId = req.user!.userId;

    await prisma.$transaction(async (tx) => {
      for (const ji of jobItems) {
        await tx.jobItem.delete({ where: { id: ji.id } });
        const item = await tx.item.findUnique({
          where: { id: ji.item_id },
          select: { status: true },
        });
        if (item?.status === "staged") {
          await tx.item.update({
            where: { id: ji.item_id },
            data: { status: "available" },
          });
          await tx.movement.create({
            data: {
              org_id: orgId,
              item_id: ji.item_id,
              job_id: jobId,
              from_status: "staged",
              to_status: "available",
              performed_by: userId,
              notes: "Removed from job",
            },
          });
        }
      }
    });

    const updated = await prisma.job.findUnique({
      where: { id: jobId },
      include: { _count: { select: { job_items: true } } },
    });
    return res.json({
      ...updated,
      item_count: updated!._count.job_items,
      unassigned_count: jobItems.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/scan-out ─────────────────────────────────────────────────
// Confirms physical loading of a pre-assigned item. Stages the item and
// activates the job if it was still in planning.

router.post("/:id/scan-out", async (req, res) => {
  try {
    const { itemId } = req.body as { itemId?: string };
    if (!itemId) return res.status(400).json({ message: "itemId is required" });

    const [job, item] = await Promise.all([
      prisma.job.findUnique({ where: { id: req.params.id } }),
      prisma.item.findUnique({
        where: { id: itemId },
        include: { set: { select: { id: true, name: true } } },
      }),
    ]);

    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (job.status !== "active" && job.status !== "planning") {
      return res.status(400).json({ message: "Job is not active or planning", type: "invalid_job_status" });
    }

    // Item must be pre-assigned to this job and not yet loaded
    const jobItem = await prisma.jobItem.findFirst({
      where: { job_id: req.params.id, item_id: itemId, status: "assigned" },
    });

    if (!jobItem) {
      // Give a helpful message depending on why
      const alreadyLoaded = await prisma.jobItem.findFirst({
        where: { job_id: req.params.id, item_id: itemId, status: { in: ["loaded", "delivered", "picked_up"] } },
      });
      if (alreadyLoaded) {
        return res.status(409).json({ message: "Item is already loaded for this job", type: "already_loaded", item });
      }
      return res.status(404).json({ message: "Item is not assigned to this job", type: "not_on_job", item });
    }

    const userId = req.user!.userId;
    const jobActivated = job.status === "planning";

    await prisma.$transaction(async (tx) => {
      await loadAssignedItem(tx, {
        orgId: req.user!.org_id,
        jobId: req.params.id,
        itemId,
        jobItemId: jobItem.id,
        userId,
        activateJob: jobActivated,
      });
    });

    const remainingToLoad = await prisma.jobItem.count({
      where: { job_id: req.params.id, status: "assigned" },
    });

    const updated = await prisma.item.findUnique({
      where: { id: itemId },
      include: { set: { select: { id: true, name: true } } },
    });
    return res.json({ item: updated, job_activated: jobActivated, remaining_to_load: remainingToLoad });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/mark-loaded ──────────────────────────────────────────────
// Manager override: same effect as scan-out without the camera.

router.post("/:id/mark-loaded", requireManager, async (req, res) => {
  try {
    const { itemId } = req.body as { itemId?: string };
    if (!itemId) return res.status(400).json({ message: "itemId is required" });

    const [job, item] = await Promise.all([
      prisma.job.findUnique({ where: { id: req.params.id } }),
      prisma.item.findUnique({ where: { id: itemId } }),
    ]);

    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (job.status !== "active" && job.status !== "planning") {
      return res.status(400).json({ message: "Job is not active or planning", type: "invalid_job_status" });
    }

    const jobItem = await prisma.jobItem.findFirst({
      where: { job_id: req.params.id, item_id: itemId, status: "assigned" },
    });
    if (!jobItem) {
      const alreadyLoaded = await prisma.jobItem.findFirst({
        where: { job_id: req.params.id, item_id: itemId, status: { in: ["loaded", "delivered", "picked_up"] } },
      });
      if (alreadyLoaded) {
        return res.status(409).json({ message: "Item is already loaded for this job", type: "already_loaded" });
      }
      return res.status(404).json({ message: "Item is not assigned to this job", type: "not_on_job" });
    }

    const jobActivated = job.status === "planning";
    await prisma.$transaction(async (tx) => {
      await loadAssignedItem(tx, {
        orgId: req.user!.org_id,
        jobId: req.params.id,
        itemId,
        jobItemId: jobItem.id,
        userId: req.user!.userId,
        activateJob: jobActivated,
        notes: "Manually marked loaded",
      });
    });

    const remainingToLoad = await prisma.jobItem.count({
      where: { job_id: req.params.id, status: "assigned" },
    });
    const updated = await prisma.item.findUnique({
      where: { id: itemId },
      include: { set: { select: { id: true, name: true } } },
    });
    return res.json({ item: updated, job_activated: jobActivated, remaining_to_load: remainingToLoad });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/undo-load ────────────────────────────────────────────────
// Manager override: reverse a mistaken load (staged → available, loaded → assigned).

router.post("/:id/undo-load", requireManager, async (req, res) => {
  try {
    const { itemId } = req.body as { itemId?: string };
    if (!itemId) return res.status(400).json({ message: "itemId is required" });

    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== "active" && job.status !== "planning") {
      return res.status(400).json({ message: "Job is not active or planning" });
    }

    const jobItem = await prisma.jobItem.findFirst({
      where: { job_id: req.params.id, item_id: itemId, status: { in: ["loaded", "delivered", "picked_up"] } },
    });
    if (!jobItem) {
      return res.status(400).json({ message: "Item is not loaded on this job — nothing to undo" });
    }

    await prisma.$transaction(async (tx) => {
      await undoLoadItem(tx, {
        orgId: req.user!.org_id,
        jobId: req.params.id,
        itemId,
        jobItemId: jobItem.id,
        userId: req.user!.userId,
      });
    });

    const updated = await prisma.item.findUnique({
      where: { id: itemId },
      include: { set: { select: { id: true, name: true } } },
    });
    return res.json({ item: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/scan-return ──────────────────────────────────────────────
// Processes return of a single item with condition assessment

router.post("/:id/scan-return", async (req, res) => {
  try {
    const { itemId, condition, notes } = req.body as {
      itemId?: string;
      condition?: ReturnCond;
      notes?: string;
    };

    if (!itemId || !condition) {
      return res.status(400).json({ message: "itemId and condition are required" });
    }
    if (!["good", "damaged", "dispose"].includes(condition)) {
      return res.status(400).json({ message: "condition must be good, damaged, or dispose" });
    }

    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    const jobItem = await prisma.jobItem.findFirst({
      where: { job_id: req.params.id, item_id: itemId, status: { not: "returned" } },
    });
    if (!jobItem) {
      return res.status(404).json({ message: "Item is not on this job or already returned" });
    }

    let jobCompleted = false;
    await prisma.$transaction(async (tx) => {
      await returnItemFromJob(tx, {
        orgId: req.user!.org_id,
        jobId: req.params.id,
        itemId,
        jobItemId: jobItem.id,
        userId: req.user!.userId,
        condition,
        notes,
      });
      jobCompleted = await maybeCompleteJob(tx, req.params.id);
    });

    const remaining = await prisma.jobItem.count({
      where: { job_id: req.params.id, status: { not: "returned" } },
    });

    const updatedItem = await prisma.item.findUnique({
      where: { id: itemId },
      include: { set: { select: { id: true, name: true } } },
    });
    return res.json({ item: updatedItem, job_completed: jobCompleted, remaining });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/mark-returned ────────────────────────────────────────────
// Manager override: same effect as scan-return without the camera.

router.post("/:id/mark-returned", requireManager, async (req, res) => {
  try {
    const { itemId, condition, notes } = req.body as {
      itemId?: string;
      condition?: ReturnCond;
      notes?: string;
    };

    if (!itemId || !condition) {
      return res.status(400).json({ message: "itemId and condition are required" });
    }
    if (!["good", "damaged", "dispose"].includes(condition)) {
      return res.status(400).json({ message: "condition must be good, damaged, or dispose" });
    }

    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== "active" && job.status !== "planning") {
      return res.status(400).json({ message: "Job is not active or planning" });
    }

    const jobItem = await prisma.jobItem.findFirst({
      where: { job_id: req.params.id, item_id: itemId, status: { not: "returned" } },
    });
    if (!jobItem) {
      return res.status(404).json({ message: "Item is not on this job or already returned" });
    }

    let jobCompleted = false;
    await prisma.$transaction(async (tx) => {
      await returnItemFromJob(tx, {
        orgId: req.user!.org_id,
        jobId: req.params.id,
        itemId,
        jobItemId: jobItem.id,
        userId: req.user!.userId,
        condition,
        notes,
        movementNotes: notes || `Manually marked returned: ${condition}`,
      });
      jobCompleted = await maybeCompleteJob(tx, req.params.id);
    });

    const remaining = await prisma.jobItem.count({
      where: { job_id: req.params.id, status: { not: "returned" } },
    });
    const updatedItem = await prisma.item.findUnique({
      where: { id: itemId },
      include: { set: { select: { id: true, name: true } } },
    });
    return res.json({ item: updatedItem, job_completed: jobCompleted, remaining });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /jobs/:id/force-complete ───────────────────────────────────────────
// Manager override: closes out a job whose remaining items will never come
// back (lost, stolen, left behind). Marks every not-yet-returned item on the
// job as `missing` and completes the job. Missing items stay in inventory
// (flagged) rather than disposed — a manager can mark one "found" later.

router.post("/:id/force-complete", requireManager, async (req, res) => {
  try {
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.status !== "active" && job.status !== "planning") {
      return res.status(400).json({ message: "Only active or planning jobs can be force-completed" });
    }

    const remainingItems = await prisma.jobItem.findMany({
      where: { job_id: req.params.id, status: { not: "returned" } },
    });

    if (remainingItems.length === 0) {
      return res.status(400).json({ message: "No unreturned items on this job — use the normal completion flow" });
    }

    const userId = req.user!.userId;

    await prisma.$transaction(async (tx) => {
      await tx.jobItem.updateMany({
        where: { id: { in: remainingItems.map((ji) => ji.id) } },
        data: { status: "missing" },
      });

      await tx.item.updateMany({
        where: { id: { in: remainingItems.map((ji) => ji.item_id) } },
        data: { status: "missing" as ItemStatus },
      });

      await tx.movement.createMany({
        data: remainingItems.map((ji) => ({
          org_id: req.user!.org_id,
          item_id: ji.item_id,
          job_id: req.params.id,
          from_status: "staged",
          to_status: "missing",
          performed_by: userId,
          notes: "Marked missing — job force-completed",
        })),
      });

      await tx.job.update({
        where: { id: req.params.id },
        data: { status: "completed", actual_end_date: new Date() },
      });
    });

    return res.json({ job_completed: true, missing_count: remainingItems.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
