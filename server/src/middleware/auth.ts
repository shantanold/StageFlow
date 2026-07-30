import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { runWithOrg } from "../lib/tenantContext";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      email: string;
      role: string;
      org_id: string;
    };
    req.user = payload;
    // Every downstream query in this request (and its whole async chain) is
    // scoped to this org via AsyncLocalStorage — see src/lib/prisma.ts.
    runWithOrg(payload.org_id, next);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
