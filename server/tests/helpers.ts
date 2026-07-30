import request from "supertest";
import type { Express } from "express";
import { rawPrisma } from "../src/lib/prisma";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Wipes every app table. Only ever call this against the test DB. Uses the
 * unscoped client deliberately — this runs outside any request's tenant
 * context and needs to clean data across every org, not just one.
 */
export async function cleanDb() {
  if (!process.env.DATABASE_URL?.includes("stageflow_test")) {
    throw new Error("cleanDb() refused: DATABASE_URL does not look like the test DB.");
  }
  await rawPrisma.$transaction([
    rawPrisma.movement.deleteMany(),
    rawPrisma.jobItem.deleteMany(),
    rawPrisma.job.deleteMany(),
    rawPrisma.item.deleteMany(),
    rawPrisma.set.deleteMany(),
    rawPrisma.user.deleteMany(),
    rawPrisma.organization.deleteMany({ where: { id: { not: DEFAULT_ORG_ID } } }),
  ]);
}

/** Creates a second organization for cross-tenant isolation tests, with its own invite code. */
export async function createOrg(name = "Other Org") {
  const inviteCode = `invite-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const slug = `other-org-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return rawPrisma.organization.create({
    data: { name, slug, invite_code: inviteCode, is_active: true },
  });
}

let seq = 0;
/** Unique email per call so parallel-within-a-file tests don't collide. */
export function uniqueEmail(prefix = "test") {
  seq += 1;
  return `${prefix}${Date.now()}${seq}@example.com`;
}

interface AuthedUser {
  token: string;
  userId: string;
}

/** Registers a fresh user (via the real /auth/register route) and returns their token. */
export async function registerUser(
  app: Express,
  opts: { role?: "staff" | "manager"; email?: string; code?: string } = {}
): Promise<AuthedUser> {
  const email = opts.email ?? uniqueEmail();
  const res = await request(app).post("/api/v1/auth/register").send({
    name: "Test User",
    email,
    password: "password123",
    role: opts.role ?? "manager",
    code: opts.code ?? process.env.SIGNUP_CODE,
  });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
