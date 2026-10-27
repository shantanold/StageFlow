import app from "./app";
import { syncStaleCalendarSources } from "./lib/calendarSync";

const PORT = Number.parseInt(String(process.env.PORT ?? "3001").trim(), 10);
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT "${process.env.PORT}" — expected an integer 1–65535`);
}

const server = app.listen(PORT, () => {
  console.log(`StageFlow server running on http://localhost:${PORT}`);
});

// Refresh subscribed calendars (ICS/webcal feeds) in the background. Set
// CALENDAR_SYNC_INTERVAL_MINUTES=0 to turn it off.
const syncMinutes = Number(process.env.CALENDAR_SYNC_INTERVAL_MINUTES ?? 60);
let syncTimer: NodeJS.Timeout | undefined;
if (Number.isFinite(syncMinutes) && syncMinutes > 0) {
  let running = false;
  syncTimer = setInterval(() => {
    if (running) return;
    running = true;
    syncStaleCalendarSources(syncMinutes * 60_000)
      .catch((err) => console.error("calendar background sync failed", err))
      .finally(() => { running = false; });
  }, 5 * 60_000);
  syncTimer.unref();
}

// Graceful shutdown (Railway/Render send SIGTERM before stopping container)
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  clearInterval(syncTimer);
  server.close(() => process.exit(0));
});
