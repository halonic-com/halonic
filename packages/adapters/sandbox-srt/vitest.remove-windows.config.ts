import { defineConfig } from "vitest/config";

/**
 * The removal test for Windows (`fence/*.windows-uninstall.test.ts`), run by
 * the `sandbox-windows` CI job as its last step: it takes srt's install away,
 * so it must not run beside the fence tests.
 */
export default defineConfig({
  test: {
    include: ["fence/**/*.windows-uninstall.test.ts"],
    environment: "node",
    expect: { requireAssertions: true },
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
