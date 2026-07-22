import { execSync } from "child_process";
import dotenv from "dotenv";
import path from "path";

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

  execSync("npx prisma migrate deploy", { env, stdio: "inherit", cwd: path.resolve(__dirname, "..") });
}
