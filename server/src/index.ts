import app from "./app";

const PORT = process.env.PORT ?? 3001;

const server = app.listen(PORT, () => {
  console.log(`StageFlow server running on http://localhost:${PORT}`);
});

// Graceful shutdown (Railway/Render send SIGTERM before stopping container)
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});
