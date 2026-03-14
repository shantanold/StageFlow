import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

import authRouter  from "./routes/auth";
import itemsRouter from "./routes/items";
import setsRouter  from "./routes/sets";
import labelsRouter from "./routes/labels";
import jobsRouter  from "./routes/jobs";
import statsRouter from "./routes/stats";

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));

app.use(express.json());

// Stricter rate limit on auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1/auth",   authLimiter, authRouter);
app.use("/api/v1/items",  apiLimiter,  itemsRouter);
app.use("/api/v1/sets",   apiLimiter,  setsRouter);
app.use("/api/v1/labels", apiLimiter,  labelsRouter);
app.use("/api/v1/jobs",   apiLimiter,  jobsRouter);
app.use("/api/v1/stats",  apiLimiter,  statsRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`StageFlow server running on http://localhost:${PORT}`);
});

// Graceful shutdown (Railway/Render send SIGTERM before stopping container)
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

export default app;
