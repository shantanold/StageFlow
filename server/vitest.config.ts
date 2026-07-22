import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: "./tests/globalSetup.ts",
    setupFiles: "./tests/setupEnv.ts",
    fileParallelism: false, // tests share one Postgres DB — run serially to avoid cross-test interference
    testTimeout: 15000,
  },
});
