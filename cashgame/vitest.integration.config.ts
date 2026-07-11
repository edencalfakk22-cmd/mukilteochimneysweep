import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Integration tests share one database; run serially for determinism.
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
