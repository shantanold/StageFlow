import app from "./app";

const PORT = Number.parseInt(String(process.env.PORT ?? "3001").trim(), 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT "${process.env.PORT}" — expected an integer 1–65535`);
}

const server = app.listen(PORT, () => {
  console.log(`StageFlow server running on http://localhost:${PORT}`);
});

// Graceful shutdown (Railway/Render send SIGTERM before stopping container)
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});
