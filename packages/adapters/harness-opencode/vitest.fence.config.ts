import { defineConfig } from "vitest/config";

/**
 * The tests that need the real fence and the pinned OpenCode (see `fence/`).
 * Run by the Linux sandbox fence CI job, not by `pnpm test`.
 */
export default defineConfig({
  test: {
    include: ["fence/**/*.test.ts"],
    environment: "node",
    expect: { requireAssertions: true },
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
