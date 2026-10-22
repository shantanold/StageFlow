/**
 * Platform admins are the people who run StageFlow itself (not a customer's
 * manager). They're listed by email in PLATFORM_ADMIN_EMAILS (comma-separated)
 * rather than stored in the DB, so no customer org can ever grant the role.
 * Read on every call so tests and config changes take effect without a restart.
 */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
