import { randomBytes, randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { rawPrisma } from "./prisma";

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

/**
 * Platform admins live in their own org with no furniture, so the normal
 * (tenant-scoped) screens show them nothing and every cross-org view is an
 * explicit admin route. The org is kept inactive so its invite code can't be
 * used to register into it, and it's left out of the admin organization list.
 */
export const PLATFORM_ORG_SLUG = "stageflow-platform";
export const PLATFORM_ORG_NAME = "StageFlow Platform";

/** Creates the platform org if it doesn't exist yet. Safe to call repeatedly. */
export async function ensurePlatformOrg() {
  return rawPrisma.organization.upsert({
    where: { slug: PLATFORM_ORG_SLUG },
    update: {},
    create: {
      name: PLATFORM_ORG_NAME,
      slug: PLATFORM_ORG_SLUG,
      invite_code: `platform-${randomUUID()}`,
      is_active: false,
    },
  });
}

export interface MoveToPlatformOrgResult {
  userId: string;
  fromOrg: { id: string; name: string };
  toOrg: { id: string; name: string };
  alreadyThere: boolean;
  /** Records the user created in their old org; they stay there, attributed to the user. */
  jobsCreated: number;
  movementsPerformed: number;
}

/**
 * Moves an existing user into the platform org. With `apply: false` it only
 * reports what would happen (and doesn't create the org either). The user's
 * current token still carries the old org until they sign in again.
 */
export async function moveUserToPlatformOrg(email: string, opts: { apply: boolean }): Promise<MoveToPlatformOrgResult> {
  const user = await rawPrisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { org: { select: { id: true, name: true } } },
  });
  if (!user) throw new Error(`No user with email ${email}`);

  const existing = await rawPrisma.organization.findUnique({ where: { slug: PLATFORM_ORG_SLUG } });
  const platform = opts.apply ? await ensurePlatformOrg() : existing;
  const toOrg = platform
    ? { id: platform.id, name: platform.name }
    : { id: "(created on apply)", name: PLATFORM_ORG_NAME };

  const [jobsCreated, movementsPerformed] = await Promise.all([
    rawPrisma.job.count({ where: { created_by: user.id } }),
    rawPrisma.movement.count({ where: { performed_by: user.id } }),
  ]);

  const alreadyThere = user.org_id === platform?.id;
  if (opts.apply && !alreadyThere) {
    await rawPrisma.user.update({ where: { id: user.id }, data: { org_id: platform!.id } });
  }

  return { userId: user.id, fromOrg: user.org, toOrg, alreadyThere, jobsCreated, movementsPerformed };
}

// ─── Acting inside an org ───────────────────────────────────────────────────

/**
 * A platform admin can "enter" a customer org to use its normal screens. The
 * token carries the target org (so tenant scoping works unchanged), manager
 * rights, and `acting: true`, which makes `authenticate` re-check on every
 * request that the user is still an active platform admin. Short-lived on
 * purpose: entering again is one click.
 */
export const ACTING_TOKEN_TTL = "8h";

export function signActingToken(user: { id: string; email: string }, orgId: string) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: "manager", org_id: orgId, acting: true },
    process.env.JWT_SECRET!,
    { expiresIn: ACTING_TOKEN_TTL }
  );
}

/** True when the user exists, is active, and is on the platform-admin allowlist. */
export async function isActivePlatformAdmin(userId: string): Promise<boolean> {
  const user = await rawPrisma.user.findUnique({ where: { id: userId }, select: { email: true, is_active: true } });
  return !!user?.is_active && isPlatformAdminEmail(user.email);
}

// ─── New orgs ───────────────────────────────────────────────────────────────

/** "Bluebird Staging, LLC" → "bluebird-staging-llc". */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "org";
}

/** First free slug: "acme", then "acme-2", "acme-3", ... */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await rawPrisma.organization.findUnique({ where: { slug: candidate } }))) return candidate;
  }
}

/** Short, readable, unguessable: "BLUEBIRD-7K3Q9X". */
export function newInviteCode(name: string): string {
  const prefix = slugify(name).replace(/-/g, "").slice(0, 8).toUpperCase() || "ORG";
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const suffix = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
  return `${prefix}-${suffix}`;
}
