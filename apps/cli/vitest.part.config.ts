import type { ViteUserConfig } from "vitest/config";
import packageConfig from "./vitest.config.ts";

/**
 * One part of the CLI's tests (HAL-17930). In CI they took about 235 s as one
 * Turbo task, almost all of it each file's start-up, so Turbo runs them as two
 * tasks at once: `test:part-1` and `test:part-2` each run half the files with
 * `--shard` and write a blob report to `test-results/blob`. The `test` task
 * then merges the blobs with `vitest.merge.config.ts`, which writes the
 * package's one result file and checks the coverage floor for both parts
 * together. A part has no floor of its own: half the tests can't meet it.
 */

/** The reporter that writes `test-results/vitest.json`; only the merge writes it. */
const resultFileReporter = "json";

/**
 * The preset's reporter that fails a run when a planned file never ran. A
 * part plans every file of the package, so it would count the other part's
 * files; the merge checks that every file ran instead.
 */
const unrunFilesReporter = "UnrunTestFilesReporter";

type Reporters = NonNullable<NonNullable<ViteUserConfig["test"]>["reporters"]>;

function reporterName(reporter: unknown): string | undefined {
  if (typeof reporter === "string") {
    return reporter;
  }
  if (Array.isArray(reporter)) {
    return reporterName(reporter[0]);
  }
  if (typeof reporter === "object" && reporter !== null) {
    return reporter.constructor.name;
  }
  return undefined;
}

function partReporters(reporters: Reporters): Reporters {
  const kept = [reporters].flat().filter((reporter) => {
    const name = reporterName(reporter);
    return name !== resultFileReporter && name !== unrunFilesReporter;
  });
  return [...kept, "blob"];
}

const packageTest = packageConfig.test ?? {};

export default {
  ...packageConfig,
  test: {
    ...packageTest,
    reporters: partReporters(packageTest.reporters ?? []),
    coverage: { ...packageTest.coverage, thresholds: {} },
  },
} satisfies ViteUserConfig;
