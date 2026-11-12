import { defineConfig } from "vitest/config";

/**
 * The runner's attack list on native Windows (see `fence/*.windows.test.ts`),
 * with Node's layer only. Run by the `sandbox-windows` CI job, before srt's
 * Windows install, as Halonic runs there.
 */
export default defineConfig({
  test: {
    include: ["fence/**/*.windows.test.ts"],
    environment: "node",
    expect: { requireAssertions: true },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
