import { relative } from "node:path";
import type { Reporter, TestModule, TestSpecification } from "vitest/node";

/** What the reporter needs to know about one test file after the run. */
type FinishedFile = Pick<TestModule, "moduleId" | "state">;

/**
 * The test files Vitest planned to run but never ran. A file runs in a
 * worker, and Vitest gives a worker 60 seconds to start and set up its test
 * environment; a worker that misses that is reported as an unhandled error,
 * and its files are left out of the run. That happens to jsdom files first,
 * since jsdom loads about a thousand modules: on a busy machine, or when the
 * pnpm store is on a slow disk, such as a Windows drive shared into WSL.
 *
 * A file that ran and failed, or was skipped, isn't listed: Vitest and
 * `NoSkippedTestsReporter` already report those.
 *
 * @param planned - the module ID of every test file the run started with
 * @param finished - the test files the run reported at the end
 * @returns the module IDs of the planned files that never ran, in plan order
 *
 * @example
 * testFilesThatNeverRan(["/pkg/src/a.test.ts", "/pkg/src/b.test.ts"], modules);
 * // ["/pkg/src/b.test.ts"] when only a.test.ts ran
 */
export function testFilesThatNeverRan(
  planned: ReadonlyArray<string>,
  finished: ReadonlyArray<FinishedFile>,
): string[] {
  const ran = new Set(
    finished
      .filter((file) => file.state() !== "queued" && file.state() !== "pending")
      .map((file) => file.moduleId),
  );
  return planned.filter((moduleId) => !ran.has(moduleId));
}

/**
 * Fails the test run when a test file never ran, and says so before the
 * coverage summary. Without it, the run's only visible failure is coverage
 * below the floor, because the code those files test counts as uncovered.
 * The same code then gets a different coverage number on each run.
 */
export class UnrunTestFilesReporter implements Reporter {
  private planned: string[] = [];

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    this.planned = specifications.map((specification) => specification.moduleId);
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const unrun = testFilesThatNeverRan(this.planned, modules);
    if (unrun.length === 0) {
      return;
    }
    console.error(
      `${unrun.length} of ${this.planned.length} test file(s) never ran, most likely because ` +
        "their worker didn't start within Vitest's 60 seconds on a busy machine or a slow disk. " +
        "The coverage below leaves them out, so it is lower than the code's real coverage. " +
        "Run the tests again when the machine is less busy. If they never run, the pnpm store " +
        "may be on a slow disk: run `pnpm install --store-dir <a folder on a local disk>` " +
        "(see docs/guides/checks.md):\n" +
        unrun.map((moduleId) => `  - ${relative(process.cwd(), moduleId)}`).join("\n"),
    );
    process.exitCode = 1;
  }
}
