/**
 * Frontend origins allowed by CORS_ORIGIN (comma-separated so the old and new
 * frontend domains can both work during a move). Also the only places the
 * Google OAuth callback will redirect back to.
 */
export function allowedOrigins() {
  return (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}
