import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma, rawPrisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

const router = Router();

function signToken(userId: string, email: string, role: string, org_id: string) {
  return jwt.sign(
    { userId, email, role, org_id },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );
}

const safeUser = (u: { id: string; name: string; email: string; role: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});

// POST /api/v1/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, code } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      code?: string;
    };

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    if (!code) {
      return res.status(403).json({ message: "Invalid signup code" });
    }

    // No tenant context yet (we don't know which org until the code resolves
    // one) — every lookup here uses the unscoped client.
    const org = await rawPrisma.organization.findUnique({ where: { invite_code: code } });
    if (!org || !org.is_active) {
      return res.status(403).json({ message: "Invalid signup code" });
    }

    const existing = await rawPrisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await rawPrisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password_hash,
        role: role === "manager" ? "manager" : "staff",
        org_id: org.id,
      },
    });

    const token = signToken(user.id, user.email, user.role, user.org_id!);
    return res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    console.error("register error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/v1/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Pre-auth: we don't yet know the org, so this must stay unscoped.
    const user = await rawPrisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const token = signToken(user.id, user.email, user.role, user.org_id!);
    return res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/v1/auth/me
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, name: true, email: true, role: true, is_active: true, created_at: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.is_active) {
      return res.status(401).json({ message: "This account has been deactivated" });
    }

    const { is_active, ...rest } = user;
    return res.json(rest);
  } catch (err) {
    console.error("me error", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
