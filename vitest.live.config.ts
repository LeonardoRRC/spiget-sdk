import { defineConfig } from "vitest/config";

// Hits the real api.spiget.org. Not part of the default test run.
export default defineConfig({
  test: {
    include: ["test/live.test.ts"],
    testTimeout: 30_000,
  },
});
