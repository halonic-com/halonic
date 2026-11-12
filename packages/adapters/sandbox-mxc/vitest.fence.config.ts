import { defineConfig } from "vitest/config";

/**
 * The tests that need the real MXC fence (see `fence/`). Run by the MXC fence
 * CI job on Windows 11, not by `pnpm test`: they can't pass on a computer
 * where MXC isn't offered.
 */
export default defineConfig({
  test: {
    include: ["fence/**/*.test.ts"],
    environment: "node",
    expect: { requireAssertions: true },
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
