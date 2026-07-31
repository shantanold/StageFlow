import {
  ItemCondition,
  ItemStatus,
  Prisma,
  ReturnCondition,
} from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type ReturnCond = "good" | "damaged" | "dispose";

/** Mark a pre-assigned job_item as loaded and stage the item (scan-out / mark-loaded). */
export async function loadAssignedItem(
  tx: Tx,
  opts: {
    orgId: string;
    jobId: string;
    itemId: string;
    jobItemId: string;
    userId: string;
    activateJob: boolean;
    notes?: string;
  },
): Promise<void> {
  const { orgId, jobId, itemId, jobItemId, userId, activateJob, notes } = opts;

  await tx.jobItem.update({ where: { id: jobItemId }, data: { status: "loaded" } });
  await tx.item.update({ where: { id: itemId }, data: { status: "staged" as ItemStatus } });
  await tx.movement.create({
    data: {
      org_id: orgId,
      item_id: itemId,
      job_id: jobId,
      from_status: "available",
      to_status: "staged",
      performed_by: userId,
      notes: notes ?? "Loaded for job",
    },
  });
  if (activateJob) {
    await tx.job.update({ where: { id: jobId }, data: { status: "active" } });
  }
}

/** Reverse a load: item back to available, job_item back to assigned. */
export async function undoLoadItem(
  tx: Tx,
  opts: {
    orgId: string;
    jobId: string;
    itemId: string;
    jobItemId: string;
    userId: string;
    notes?: string;
  },
): Promise<void> {
  const { orgId, jobId, itemId, jobItemId, userId, notes } = opts;

  await tx.jobItem.update({ where: { id: jobItemId }, data: { status: "assigned" } });
  await tx.item.update({ where: { id: itemId }, data: { status: "available" as ItemStatus } });
  await tx.movement.create({
    data: {
      org_id: orgId,
      item_id: itemId,
      job_id: jobId,
      from_status: "staged",
      to_status: "available",
      performed_by: userId,
      notes: notes ?? "Manual undo load",
    },
  });
}

/** Return an item from a job with condition (scan-return / mark-returned). */
export async function returnItemFromJob(
  tx: Tx,
  opts: {
    orgId: string;
    jobId: string;
    itemId: string;
    jobItemId: string;
    userId: string;
    condition: ReturnCond;
    notes?: string | null;
    movementNotes?: string;
  },
): Promise<{ newItemStatus: ItemStatus }> {
  const { orgId, jobId, itemId, jobItemId, userId, condition, notes, movementNotes } = opts;

  const newItemStatus = (condition === "dispose" ? "disposed" : "available") as ItemStatus;
  const newCondition = (condition === "damaged" ? "damaged" : "good") as ItemCondition;
  const returnCond = condition as ReturnCondition;

  await tx.jobItem.update({
    where: { id: jobItemId },
    data: {
      status: "returned",
      return_condition: returnCond,
      return_notes: notes || null,
      returned_at: new Date(),
    },
  });
  await tx.item.update({
    where: { id: itemId },
    data: {
      status: newItemStatus,
      ...(condition !== "dispose" && { condition: newCondition }),
    },
  });
  await tx.movement.create({
    data: {
      org_id: orgId,
      item_id: itemId,
      job_id: jobId,
      from_status: "staged",
      to_status: newItemStatus,
      performed_by: userId,
      notes: movementNotes ?? notes ?? `Return: ${condition}`,
    },
  });

  return { newItemStatus };
}

/** After returns, complete the job if nothing remains outstanding. */
export async function maybeCompleteJob(tx: Tx, jobId: string): Promise<boolean> {
  const remaining = await tx.jobItem.count({
    where: { job_id: jobId, status: { not: "returned" } },
  });
  if (remaining === 0) {
    await tx.job.update({
      where: { id: jobId },
      data: { status: "completed", actual_end_date: new Date() },
    });
    return true;
  }
  return false;
}
