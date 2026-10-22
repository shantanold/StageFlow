import { randomUUID } from "crypto";
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
