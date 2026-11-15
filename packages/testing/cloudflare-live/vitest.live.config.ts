import { defineConfig } from "vitest/config";

// The live suites call the real test account, so they are not part of `test`. They run one file at a time
// and stay out of the package preset, which fails a run that skips a test or reads no coverage.
// biome-ignore lint/style/noDefaultExport: Vitest reads the config from the default export.
export default defineConfig({
  test: {
    globalSetup: ["live/fixture.setup.ts"],
    include: ["live/**/*.live.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    expect: { requireAssertions: true },
  },
});
