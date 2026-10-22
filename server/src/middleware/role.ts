import { Request, Response, NextFunction } from "express";
import { rawPrisma } from "../lib/prisma";
import { isPlatformAdminEmail } from "../lib/platformAdmin";

/** Restrict a route to managers only. Must be used after `authenticate`. */
export function requireManager(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (req.user.role !== "manager") {
    return res.status(403).json({ message: "Manager role required" });
  }
  next();
}

/**
 * Restrict a route to platform admins (see src/lib/platformAdmin.ts). Must be
 * used after `authenticate`. Re-reads the user so a deactivated or deleted
 * account loses access even while its token is still valid.
 */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const user = await rawPrisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true, is_active: true },
    });
    if (!user?.is_active || !isPlatformAdminEmail(user.email)) {
      return res.status(403).json({ message: "Platform admin access required" });
    }
    next();
  } catch (err) {
    console.error("requirePlatformAdmin error", err);
    return res.status(500).json({ message: "Server error" });
  }
}
