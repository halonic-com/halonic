import { defineConfig } from "vitest/config";

// The live check reads a real Paperclip server with a board key, so it is not part of `test`. It
// stays out of the package preset, which fails a run that skips a test or reads no coverage, and
// runs its tests in order so the last one sees every request. Its script is `test:board`, not
// `test:live`: the `live-cloud` workflow runs `test:live` in every package and has no board key.
// biome-ignore lint/style/noDefaultExport: Vitest reads the config from the default export.
export default defineConfig({
  test: {
    include: ["live/**/*.live.test.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
    sequence: { shuffle: false },
    expect: { requireAssertions: true },
  },
});
