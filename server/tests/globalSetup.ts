import { execSync } from "child_process";
import dotenv from "dotenv";
import path from "path";
import { PrismaClient } from "@prisma/client";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";
const ORG_ID_REQUIRED = "20260729144551_org_id_required";

function migrateDeploy(env: Record<string, string>) {
  execSync("npx prisma migrate deploy", {
    env,
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });
}

// Runs once before the whole test run (main process, not per-file).
// Applies every migration to the test DB so tests run against the same
// schema prod will have — catches migration bugs, not just app bugs.
export default async function globalSetup() {
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
  );
  dotenv.config({ path: path.resolve(__dirname, "../.env.test"), processEnv: env, override: true });

  if (!env.DATABASE_URL?.includes("stageflow_test")) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL does not look like the test DB (${env.DATABASE_URL}). ` +
      `Check server/.env.test.`
    );
  }

  if (!env.SIGNUP_CODE) {
    throw new Error("SIGNUP_CODE missing from server/.env.test");
  }

  try {
    migrateDeploy(env);
  } catch {
    // Fresh DBs hit NOT NULL on organizations.invite_code before any invite is set
    // (backfill migration creates the default org without one). Backfill, clear the
    // failed migration marker, and retry — same fix needed on any empty environment.
    const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      await db.$executeRawUnsafe(
        `UPDATE organizations SET invite_code = $1 WHERE invite_code IS NULL`,
        env.SIGNUP_CODE
      );
    } finally {
      await db.$disconnect();
    }

    execSync(`npx prisma migrate resolve --rolled-back ${ORG_ID_REQUIRED}`, {
      env,
      stdio: "inherit",
      cwd: path.resolve(__dirname, ".."),
    });
    migrateDeploy(env);
  }

  // Ensure the default org invite matches .env.test so registerUser() works
  // even if a previous run left a different code.
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  await db.organization.update({
    where: { id: DEFAULT_ORG_ID },
    data: { invite_code: env.SIGNUP_CODE },
  });
  await db.$disconnect();
}
