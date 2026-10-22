import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { runWithOrg } from "../lib/tenantContext";
import { isActivePlatformAdmin } from "../lib/platformAdmin";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.slice(7);
  let payload: { userId: string; email: string; role: string; org_id: string; acting?: boolean };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as typeof payload;
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  req.user = payload;
  // Every downstream query in this request (and its whole async chain) is
  // scoped to this org via AsyncLocalStorage — see src/lib/prisma.ts.
  if (!payload.acting) {
    return runWithOrg(payload.org_id, next);
  }

  // A platform admin acting inside a customer org: the token alone isn't
  // enough, they must still be an active platform admin right now.
  isActivePlatformAdmin(payload.userId)
    .then((ok) => {
      if (!ok) return res.status(401).json({ message: "Platform admin access has been revoked" });
      runWithOrg(payload.org_id, next);
    })
    .catch((err) => {
      console.error("authenticate (acting) error", err);
      res.status(500).json({ message: "Server error" });
    });
}
