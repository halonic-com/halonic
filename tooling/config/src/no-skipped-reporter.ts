import type { Reporter, TestModule } from "vitest/node";

/** The operating systems a platform skip may name: the values of `process.platform`. */
const PLATFORMS = [
  "aix",
  "android",
  "darwin",
  "freebsd",
  "haiku",
  "linux",
  "openbsd",
  "sunos",
  "win32",
  "cygwin",
  "netbsd",
] as const;

const PLATFORM_SKIP = new RegExp(`^\\[platform:(?:${PLATFORMS.join("|")})\\] \\S`);

/**
 * Whether a test name marks a skip that is right for the platform, such as
 * `[platform:darwin] bwrap is Linux-only`. The reason after the prefix is
 * required.
 */
export function isPlatformSkip(testName: string): boolean {
  return PLATFORM_SKIP.test(testName);
}

/** A test in a run that did not run, with the file it is in. */
export interface SkippedTest {
  readonly name: string;
  readonly platform: boolean;
}

/**
 * The tests in a run that did not run: `.skip`, `.todo`, `skipIf`,
 * `ctx.skip()` and a skip hidden behind a `biome-ignore`. Vitest reports every
 * spelling as `skipped`, so this catches what the lint rule can't. A skip is
 * a `platform` skip when the test's own name starts with `[platform:<os>] `
 * and a reason. A todo is never a platform skip, whatever its name.
 */
export function skippedTests(modules: ReadonlyArray<TestModule>): SkippedTest[] {
  return modules.flatMap((module) =>
    [...module.children.allTests()]
      .filter((test) => test.result().state === "skipped")
      .map((test) => ({
        name: `${module.moduleId}: ${test.fullName}`,
        platform: test.options.mode !== "todo" && isPlatformSkip(test.name),
      })),
  );
}

/** The full names of the skipped tests, platform skips included. */
export function skippedTestNames(modules: ReadonlyArray<TestModule>): string[] {
  return skippedTests(modules).map((test) => test.name);
}

/**
 * Fails the test run when any test was skipped or left as a todo, except a
 * platform skip with a reason. Those are listed in the summary so they never
 * pass silently.
 */
export class NoSkippedTestsReporter implements Reporter {
  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const skipped = skippedTests(modules);
    const platform = skipped.filter((test) => test.platform);
    const rejected = skipped.filter((test) => !test.platform);
    if (platform.length > 0) {
      console.log(
        `${platform.length} test(s) were skipped for the platform:\n` +
          platform.map((test) => `  - ${test.name}`).join("\n"),
      );
    }
    if (rejected.length === 0) {
      return;
    }
    console.error(
      `${rejected.length} test(s) were skipped or are todo. Run them or delete them:\n` +
        rejected.map((test) => `  - ${test.name}`).join("\n"),
    );
    process.exitCode = 1;
  }
}
