import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma";

/** Wipes every app table. Only ever call this against the test DB. */
export async function cleanDb() {
  if (!process.env.DATABASE_URL?.includes("stageflow_test")) {
    throw new Error("cleanDb() refused: DATABASE_URL does not look like the test DB.");
  }
  await prisma.$transaction([
    prisma.movement.deleteMany(),
    prisma.jobItem.deleteMany(),
    prisma.job.deleteMany(),
    prisma.item.deleteMany(),
    prisma.set.deleteMany(),
    prisma.user.deleteMany(),
  ]);
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
  opts: { role?: "staff" | "manager"; email?: string } = {}
): Promise<AuthedUser> {
  const email = opts.email ?? uniqueEmail();
  const res = await request(app).post("/api/v1/auth/register").send({
    name: "Test User",
    email,
    password: "password123",
    role: opts.role ?? "manager",
    code: process.env.SIGNUP_CODE,
  });
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
