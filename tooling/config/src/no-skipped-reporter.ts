import type { Reporter, TestModule } from "vitest/node";

/**
 * The full names of the tests in a run that did not run: `.skip`, `.todo`,
 * `skipIf`, `ctx.skip()` and a skip hidden behind a `biome-ignore`. Vitest
 * reports every spelling as `skipped`, so this catches what the lint rule
 * can't.
 */
export function skippedTestNames(modules: ReadonlyArray<TestModule>): string[] {
  return modules.flatMap((module) =>
    [...module.children.allTests()]
      .filter((test) => test.result().state === "skipped")
      .map((test) => `${module.moduleId}: ${test.fullName}`),
  );
}

/** Fails the test run when any test was skipped or left as a todo. */
export class NoSkippedTestsReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const skipped = skippedTestNames(modules);
    if (skipped.length === 0) {
      return;
    }
    console.error(
      `${skipped.length} test(s) were skipped or are todo. Run them or delete them:\n` +
        skipped.map((name) => `  - ${name}`).join("\n"),
    );
    process.exitCode = 1;
  }
}
