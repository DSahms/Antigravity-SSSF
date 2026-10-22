import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [
      "test/**/*.bun.test.ts",
      "**/release/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/.tmp/**",
      "**/tmp/**"
    ],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The approval test is pure Node and uses Bun's fetch; the tour test
    // uses Playwright. Both run in node environment (not jsdom).
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
});
