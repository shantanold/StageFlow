import { Router } from "express";
import { Prisma, ItemStatus, ItemCondition } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";

const router = Router();

// ─── GET /items/:id/qr  (public — SKU is on physical labels) ─────────────────

router.get("/:id/qr", async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
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
    const { search, status, condition, category, set_id } = req.query as Record<string, string>;

    const where: Prisma.ItemWhereInput = {};

    const validStatuses: ItemStatus[] = ["available", "staged", "disposed"];
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

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await prisma.item.findMany({
      where,
      include: { set: { select: { id: true, name: true } } },
      orderBy: { created_at: "desc" },
    });

    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /items ──────────────────────────────────────────────────────────────

router.post("/", requireManager, async (req, res) => {
  try {
    const { name, category, set_id, purchase_cost, purchase_date, notes, photo_url } =
      req.body as {
        name?: string;
        category?: string;
        set_id?: string;
        purchase_cost?: number;
        purchase_date?: string;
        notes?: string;
        photo_url?: string;
      };

    if (!name?.trim() || !category || !purchase_date) {
      return res.status(400).json({ message: "name, category, and purchase_date are required" });
    }

    const sku = await generateSku();

    const item = await prisma.item.create({
      data: {
        sku,
        name: name.trim(),
        category,
        set_id: set_id || null,
        purchase_cost: purchase_cost ?? 0,
        purchase_date: new Date(purchase_date),
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

// ─── GET /items/sku/:sku — look up by exact SKU (for QR scanner) ─────────────

router.get("/sku/:sku", async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
      where: { sku: req.params.sku },
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

    const { name, category, set_id, condition, notes, photo_url, purchase_cost, purchase_date } =
      req.body as Partial<{
        name: string;
        category: string;
        set_id: string | null;
        condition: ItemCondition;
        notes: string | null;
        photo_url: string | null;
        purchase_cost: number;
        purchase_date: string;
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
        ...(purchase_date !== undefined && { purchase_date: new Date(purchase_date) }),
      },
      include: { set: { select: { id: true, name: true } } },
    });

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

export default router;
