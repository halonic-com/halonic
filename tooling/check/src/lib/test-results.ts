import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/** What reading a package's result file gave. */
export type TestResults =
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly reason: string }
  | { readonly kind: "read"; readonly outcomes: readonly TestOutcome[] };

/**
 * Reads a package's result file. A file that isn't a Vitest JSON report,
 * for example one cut short, comes back as `unreadable` with the reason,
 * so the check can name the file instead of stopping.
 *
 * Vitest writes absolute paths. The file may come from Turbo's cache,
 * made in another checkout, so a path is matched by the package folder in
 * it rather than by this checkout's root.
 */
export function readTestResults(root: string, packageDirectory: string): TestResults {
  const path = join(root, packageDirectory, testResultsFile);
  if (!existsSync(path)) {
    return { kind: "missing" };
  }
  let report: unknown;
  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { kind: "unreadable", reason: `it isn't valid JSON (${(error as Error).message})` };
  }
  const testFiles = isObject(report) ? report["testResults"] : undefined;
  if (!Array.isArray(testFiles)) {
    return { kind: "unreadable", reason: "it has no testResults list" };
  }
  const outcomes: TestOutcome[] = [];
  for (const testFile of testFiles) {
    const results = isObject(testFile) ? testFile["assertionResults"] : undefined;
    if (!isObject(testFile) || typeof testFile["name"] !== "string" || !Array.isArray(results)) {
      return { kind: "unreadable", reason: "a test file in it has no name or assertionResults" };
    }
    const file = repoRelativeTestFile(testFile["name"], packageDirectory);
    for (const result of results) {
      const outcome = readOutcome(file, result);
      if (outcome === undefined) {
        return { kind: "unreadable", reason: `a test in ${file} has no fullName or status` };
      }
      outcomes.push(outcome);
    }
  }
  return { kind: "read", outcomes };
}

function readOutcome(file: string, result: unknown): TestOutcome | undefined {
  if (!isObject(result)) {
    return undefined;
  }
  const { fullName, status, meta } = result;
  if (typeof fullName !== "string" || typeof status !== "string") {
    return undefined;
  }
  const requirement = isObject(meta) ? meta["requirement"] : undefined;
  return {
    file,
    name: fullName,
    status,
    requirement: typeof requirement === "string" ? requirement : undefined,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repoRelativeTestFile(absolutePath: string, packageDirectory: string): string {
  const path = absolutePath.replaceAll("\\", "/");
  const marker = `/${packageDirectory}/`;
  const at = path.lastIndexOf(marker);
  return at === -1 ? path : path.slice(at + 1);
}
