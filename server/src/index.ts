import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import authRouter  from "./routes/auth";
import itemsRouter from "./routes/items";
import setsRouter  from "./routes/sets";
import labelsRouter from "./routes/labels";
import jobsRouter  from "./routes/jobs";

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));

app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/v1/auth",   authRouter);
app.use("/api/v1/items",  itemsRouter);
app.use("/api/v1/sets",   setsRouter);
app.use("/api/v1/labels", labelsRouter);
app.use("/api/v1/jobs",   jobsRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`StageFlow server running on http://localhost:${PORT}`);
});

export default app;
