import { defineConfig } from "vitest/config";

/**
 * The tests that need the real fence (see `fence/`). Run by the sandbox CI
 * jobs, not by `pnpm test`: they can't pass on a machine where the sandbox
 * can't start.
 */
export default defineConfig({
  test: {
    include: ["fence/**/*.test.ts"],
    environment: "node",
    expect: { requireAssertions: true },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
