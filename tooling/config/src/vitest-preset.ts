import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config";
import { coverageSettings } from "./coverage.ts";
import { usesFastCheck } from "./fast-check-seed.ts";
import { NoSkippedTestsReporter } from "./no-skipped-reporter.ts";
import { UnrunTestFilesReporter } from "./unrun-files-reporter.ts";

/** Where each package's test run writes its result file, relative to the package. */
export const testResultsFile = "test-results/vitest.json";

/** The setup file that gives fast-check a fixed seed (see `fastCheckSeed`). */
export const fastCheckSetupFile = fileURLToPath(new URL("./fast-check-setup.ts", import.meta.url));

/** How many test workers a run uses outside CI, unless `HALONIC_TEST_WORKERS` says otherwise. */
const localTestWorkers = 2;

/**
 * The most test workers Vitest may start, or `undefined` to keep its defaults.
 * In CI that is always `undefined`. On a developer machine or agent runner
 * it is {@link localTestWorkers}, because many runs at once overload the
 * machine. `HALONIC_TEST_WORKERS` picks another count when it holds a whole
 * number of 1 or more.
 *
 * @param env - the process environment
 * @returns the worker cap, or `undefined` for no cap
 */
export function testWorkerLimit(env: NodeJS.ProcessEnv): number | undefined {
  if (env["CI"]) {
    return undefined;
  }
  const requested = Number(env["HALONIC_TEST_WORKERS"]);
  return Number.isInteger(requested) && requested >= 1 ? requested : localTestWorkers;
}

/**
 * The shared Vitest settings for every package. Each package's
 * `vitest.config.ts` calls this so test runs behave the same everywhere.
 *
 * Every run measures coverage of `src` and fails below the package's floor
 * in its `package.json`. Vitest runs in the package folder, so
 * that is where the floor is read from. A dependency whose floor says
 * `"measuredIn"` this package is measured here too, each folder against its
 * own floor (see `coverageSettings`). To run a single test file without
 * the floor, add `--coverage.enabled=false`.
 *
 * A package may not turn `expect.requireAssertions` off, and a skipped or
 * todo test fails the run (see `NoSkippedTestsReporter`). Test files end in
 * `.test.ts` or `.test.tsx`; a `.spec.ts` file is a helper, not a test.
 *
 * In a package that uses fast-check, every property runs with a fixed seed,
 * so each run makes the same `expect` calls. `FAST_CHECK_SEED` picks another
 * seed, or `random` (see `fastCheckSeed`).
 *
 * Outside CI, tests run on at most 2 workers so that several runs at once
 * don't overload the machine (see `testWorkerLimit`). Set
 * `HALONIC_TEST_WORKERS` to change that. CI keeps Vitest's defaults.
 *
 * @param overrides - settings for this one package, merged over the preset
 * @returns the Vitest config for the package
 *
 * @example
 * export default definePackageTestConfig();
 */
export function definePackageTestConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  if (overrides.test?.expect?.requireAssertions !== undefined) {
    throw new Error(
      "A package can't change expect.requireAssertions: every test needs an assertion.",
    );
  }
  const coverage = coverageSettings(process.cwd());
  const maxWorkers = testWorkerLimit(process.env);
  const preset = defineConfig({
    test: {
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      environment: "node",
      ...(maxWorkers === undefined ? {} : { maxWorkers }),
      // Property tests check the same inputs on every run, so the requirement
      // guard sees the same expect counts on both sides.
      setupFiles: usesFastCheck(process.cwd()) ? [fastCheckSetupFile] : [],
      // A test that never ran must not count as passing.
      passWithNoTests: false,
      // A test with no assertion fails, so a test can't be emptied out to
      // pass. verifies() records each test's count for the guard.
      expect: { requireAssertions: true },
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
        // A skipped or todo test fails the run, however it was written.
        new NoSkippedTestsReporter(),
        // A test file whose worker never started fails the run, and the
        // failure says so instead of showing up only as low coverage.
        new UnrunTestFilesReporter(),
      ],
      coverage: {
        enabled: true,
        provider: "v8",
        include: coverage.include,
        exclude: coverage.exclude,
        allowExternal: coverage.allowExternal,
        reporter: ["text-summary"],
        thresholds: coverage.thresholds,
      },
    },
  });
  return mergeConfig(preset, overrides);
}
