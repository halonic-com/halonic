import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config";
import { readCoverageFloor } from "./coverage.ts";

/** Where each package's test run writes its result file, relative to the package. */
export const testResultsFile = "test-results/vitest.json";

/**
 * The shared Vitest settings for every package. Each package's
 * `vitest.config.ts` calls this so test runs behave the same everywhere.
 *
 * Every run measures coverage of `src` and fails below the package's floor
 * in its `package.json`. Vitest runs in the package folder, so
 * that is where the floor is read from. To run a single test file without
 * the floor, add `--coverage.enabled=false`.
 *
 * @param overrides - settings for this one package, merged over the preset
 * @returns the Vitest config for the package
 *
 * @example
 * export default definePackageTestConfig();
 */
export function definePackageTestConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  const preset = defineConfig({
    test: {
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      environment: "node",
      // A test that never ran must not count as passing.
      passWithNoTests: false,
      // Tests may not depend on the order they run in.
      sequence: { shuffle: true },
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
      reporters: [
        ...(process.env["CI"] ? ["default", "github-actions"] : ["default"]),
        // The result file: which tests ran and passed, with the requirement
        // each one proves. `pnpm check trace` reads it, and Turbo
        // caches it as an output of the test task.
        ["json", { outputFile: testResultsFile }],
      ],
      coverage: {
        enabled: true,
        provider: "v8",
        include: ["src/**/*.ts", "src/**/*.tsx"],
        // Tests, test helpers and generated files aren't the code under test.
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/test/**", "src/generated/**"],
        reporter: ["text-summary"],
        thresholds: readCoverageFloor(process.cwd()),
      },
    },
  });
  return mergeConfig(preset, overrides);
}
