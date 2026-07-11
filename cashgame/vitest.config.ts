import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // Component tests (.tsx) opt into jsdom via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
