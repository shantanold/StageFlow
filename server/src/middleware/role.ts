import { Request, Response, NextFunction } from "express";

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
