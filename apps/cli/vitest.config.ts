import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";
import type { ViteUserConfig } from "vitest/config";
import { filesWithModuleMocks } from "./src/test/module-mock-files.ts";

const presetConfig = definePackageTestConfig({
  // Every command test fails when a command's lines printed ahead don't start its result.
  test: { setupFiles: ["./src/test/print-ahead-check.spec.ts"] },
});

const presetTest = presetConfig.test ?? {};

export default {
  ...presetConfig,
  test: {
    ...presetTest,
    // Each project names its own files: Vitest adds the root's `include` to
    // every inline project, so the root has none.
    include: [],
    // Starting each file in a fresh module cache took most of a run's time:
    // about 60 of the 94 seconds, for 281 files.
    projects: [
      {
        test: {
          ...presetTest,
          name: "shared-modules",
          exclude: filesWithModuleMocks,
          isolate: false,
        },
      },
      { test: { ...presetTest, name: "module-mocks", include: filesWithModuleMocks } },
    ],
  },
} satisfies ViteUserConfig;
