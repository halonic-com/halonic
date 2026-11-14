import { defineConfig } from "vitest/config";

/**
 * The runner's attack list in MXC on Windows 11 (see `fence/*.mxc.test.ts`).
 * Run by the `sandbox-mxc-fence` CI job on `windows-11-arm`: it can't pass on
 * a computer where MXC isn't offered. A real box is slow, so files run one
 * after the other.
 */
export default defineConfig({
  test: {
    include: ["fence/**/*.mxc.test.ts"],
    fileParallelism: false,
    environment: "node",
    expect: { requireAssertions: true },
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
