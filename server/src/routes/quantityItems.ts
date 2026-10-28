import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";

const router = Router();
router.use(authenticate);

// ─── GET /quantity-items ──────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const { category } = req.query as Record<string, string>;

    const where: any = {};
    if (category) {
      where.category = { equals: category, mode: "insensitive" };
    }

    const items = await prisma.quantityItem.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /quantity-items/:id ──────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const item = await prisma.quantityItem.findUnique({
      where: { id: req.params.id },
    });

    if (!item) return res.status(404).json({ message: "Item not found" });

    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /quantity-items ─────────────────────────────────────────────────────

router.post("/", requireManager, async (req, res) => {
  try {
    const { name, category, quantity, unit_cost, notes } = req.body as {
      name?: string;
      category?: string;
      quantity?: number;
      unit_cost?: number;
      notes?: string;
    };

    if (!name?.trim() || !category?.trim()) {
      return res.status(400).json({ message: "name and category are required" });
    }

    const item = await prisma.quantityItem.create({
      data: {
        org_id: req.user!.org_id,
        name: name.trim(),
        category: category.trim(),
        quantity: quantity ?? 0,
        unit_cost: unit_cost ?? 0,
        notes: notes?.trim() || null,
      },
    });

    return res.status(201).json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── PUT /quantity-items/:id ──────────────────────────────────────────────────

router.put("/:id", requireManager, async (req, res) => {
  try {
    const existing = await prisma.quantityItem.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) return res.status(404).json({ message: "Item not found" });

    const { name, category, quantity, unit_cost, notes } = req.body as Partial<{
      name: string;
      category: string;
      quantity: number;
      unit_cost: number;
      notes: string | null;
    }>;

    const item = await prisma.quantityItem.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(category !== undefined && { category: category.trim() }),
        ...(quantity !== undefined && { quantity }),
        ...(unit_cost !== undefined && { unit_cost }),
        ...(notes !== undefined && { notes }),
      },
    });

    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── DELETE /quantity-items/:id ───────────────────────────────────────────────

router.delete("/:id", requireManager, async (req, res) => {
  try {
    const existing = await prisma.quantityItem.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) return res.status(404).json({ message: "Item not found" });

    await prisma.quantityItem.delete({
      where: { id: req.params.id },
    });

    return res.json({ message: "Item deleted", id: req.params.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /quantity-items/:id/adjust ──────────────────────────────────────────
// Adjust quantity by a delta (positive or negative)

router.post("/:id/adjust", requireManager, async (req, res) => {
  try {
    const { adjustment, notes } = req.body as {
      adjustment?: number;
      notes?: string;
    };

    if (adjustment === undefined || !Number.isInteger(adjustment)) {
      return res.status(400).json({ message: "adjustment must be an integer" });
    }

    const existing = await prisma.quantityItem.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) return res.status(404).json({ message: "Item not found" });

    const newQuantity = Math.max(0, existing.quantity + adjustment);

    const item = await prisma.quantityItem.update({
      where: { id: req.params.id },
      data: {
        quantity: newQuantity,
        ...(notes !== undefined && { notes }),
      },
    });

    return res.json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
