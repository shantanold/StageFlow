import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { requireManager } from "../middleware/role";

const router = Router();
router.use(authenticate, requireManager);

const safeUser = (u: { id: string; name: string; email: string; role: string; is_active: boolean; created_at: Date }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  is_active: u.is_active,
  created_at: u.created_at,
});

// ─── GET /users ─────────────────────────────────────────────────────────────

router.get("/", async (_req, res) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { created_at: "asc" } });
    return res.json(users.map(safeUser));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── PATCH /users/:id ───────────────────────────────────────────────────────
// Manager-only: change role or active status. Can't touch your own account,
// so a single manager can't lock themselves out.

router.patch("/:id", async (req, res) => {
  try {
    if (req.params.id === req.user!.userId) {
      return res.status(400).json({ message: "You can't change your own role or access here" });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "User not found" });

    const { role, is_active } = req.body as { role?: string; is_active?: boolean };
    if (role !== undefined && role !== "staff" && role !== "manager") {
      return res.status(400).json({ message: "role must be staff or manager" });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(role !== undefined && { role: role as Role }),
        ...(is_active !== undefined && { is_active }),
      },
    });

    return res.json(safeUser(user));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
