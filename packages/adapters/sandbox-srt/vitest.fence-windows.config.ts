import { defineConfig } from "vitest/config";

/** The fence test for Windows (see `fence/*.windows.test.ts`), run by the `sandbox-windows` CI job after srt's Windows install. */
export default defineConfig({
  test: {
    include: ["fence/**/*.windows.test.ts"],
    environment: "node",
    expect: { requireAssertions: true },
    testTimeout: 90_000,
    hookTimeout: 120_000,
  },
});
