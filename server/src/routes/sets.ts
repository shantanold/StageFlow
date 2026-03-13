import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";

const router = Router();
router.use(authenticate);

function computeSetStats(items: { status: string }[]) {
  const active = items.filter((i) => i.status !== "disposed");
  return {
    item_count: active.length,
    available_count: active.filter((i) => i.status === "available").length,
    staged_count: active.filter((i) => i.status === "staged").length,
  };
}

// ─── GET /sets ────────────────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  try {
    const sets = await prisma.set.findMany({
      orderBy: { name: "asc" },
      include: {
        items: {
          select: { status: true },
        },
      },
    });

    const result = sets.map(({ items, ...s }) => ({
      ...s,
      ...computeSetStats(items),
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POST /sets ───────────────────────────────────────────────────────────────

router.post("/", requireManager, async (req, res) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) {
      return res.status(400).json({ message: "name is required" });
    }

    const set = await prisma.set.create({
      data: { name: name.trim(), description: description?.trim() ?? "" },
    });

    return res.status(201).json({ ...set, item_count: 0, available_count: 0, staged_count: 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /sets/:id ────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const set = await prisma.set.findUnique({
      where: { id: req.params.id },
      include: { items: { select: { status: true } } },
    });
    if (!set) return res.status(404).json({ message: "Set not found" });

    const { items, ...rest } = set;
    return res.json({ ...rest, ...computeSetStats(items) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── PUT /sets/:id ────────────────────────────────────────────────────────────

router.put("/:id", requireManager, async (req, res) => {
  try {
    const existing = await prisma.set.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Set not found" });

    const { name, description } = req.body as { name?: string; description?: string };

    const set = await prisma.set.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
      },
      include: { items: { select: { status: true } } },
    });

    const { items, ...rest } = set;
    return res.json({ ...rest, ...computeSetStats(items) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── GET /sets/:id/items ──────────────────────────────────────────────────────

router.get("/:id/items", async (req, res) => {
  try {
    const set = await prisma.set.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!set) return res.status(404).json({ message: "Set not found" });

    const items = await prisma.item.findMany({
      where: { set_id: req.params.id, status: { not: "disposed" } },
      include: { set: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
