import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./workspace.ts";

/**
 * Where each package's test run writes Vitest's JSON report, relative to
 * the package. The shared Vitest preset writes it (`testResultsFile` in
 * tooling/config); a test keeps the two the same.
 */
export const testResultsFile = "test-results/vitest.json";

/** One test from a result file. */
export interface TestOutcome {
  /** The test file, relative to the repo root. */
  readonly file: string;
  /** The describe titles and the test title, joined. */
  readonly name: string;
  /** Vitest's status: `passed`, `failed`, `skipped`, `pending` or `todo`. */
  readonly status: string;
  /** The requirement ID `verifies()` tagged the test with, if any. */
  readonly requirement: string | undefined;
}

/** The parts of Vitest's JSON report the trace check reads. */
interface VitestJsonReport {
  readonly testResults?: readonly {
    readonly name: string;
    readonly assertionResults?: readonly {
      readonly fullName: string;
      readonly status: string;
      readonly meta?: { readonly requirement?: unknown };
    }[];
  }[];
}

/**
 * Reads a package's result file.
 *
 * Vitest writes absolute paths. The file may come from Turbo's cache,
 * made in another checkout, so a path is matched by the package folder in
 * it rather than by this checkout's root.
 *
 * @returns the tests that ran, or `undefined` when the package has no result file
 */
export function readTestResults(root: string, packageDirectory: string): TestOutcome[] | undefined {
  const path = join(root, packageDirectory, testResultsFile);
  if (!existsSync(path)) {
    return undefined;
  }
  const report = readJson<VitestJsonReport>(path);
  const outcomes: TestOutcome[] = [];
  for (const testFile of report.testResults ?? []) {
    const file = repoRelativeTestFile(testFile.name, packageDirectory);
    for (const result of testFile.assertionResults ?? []) {
      const requirement = result.meta?.requirement;
      outcomes.push({
        file,
        name: result.fullName,
        status: result.status,
        requirement: typeof requirement === "string" ? requirement : undefined,
      });
    }
  }
  return outcomes;
}

function repoRelativeTestFile(absolutePath: string, packageDirectory: string): string {
  const path = absolutePath.replaceAll("\\", "/");
  const marker = `/${packageDirectory}/`;
  const at = path.lastIndexOf(marker);
  return at === -1 ? path : path.slice(at + 1);
}
