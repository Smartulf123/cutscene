import { defineConfig } from "vitest/config";

// Tests run against the built .mjs files, so `npm test` builds first (see package.json).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
