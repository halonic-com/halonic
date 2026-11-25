import { globSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ViteUserConfig } from "vitest/config";
import type { Reporter, TestModule } from "vitest/node";
import packageConfig from "./vitest.config.ts";

/**
 * The merge of the CLI's test parts, run by `test` (see
 * `vitest.part.config.ts`): the package's own reporters write the result file
 * and check the floor, and one more checks that every test file ran
 * in one of the parts.
 */

/**
 * Fails the merge when a test file of the package ran in neither part: a
 * part's blob is missing, or a file's worker never started. Without it, the
 * merge's only visible failure would be a floor it falls short of.
 */
class AllTestFilesRanReporter implements Reporter {
  private readonly include: ReadonlyArray<string>;

  /** @param include - the package's test file globs, as in its Vitest config */
  constructor(include: ReadonlyArray<string>) {
    this.include = include;
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const ran = new Set(
      modules
        .filter((module) => module.state() !== "queued" && module.state() !== "pending")
        .map((module) => resolve(module.moduleId)),
    );
    const unrun = globSync([...this.include])
      .map((file) => resolve(file))
      .filter((file) => !ran.has(file))
      .sort();
    if (unrun.length === 0) {
      return;
    }
    console.error(
      `${unrun.length} test file(s) ran in neither part of the CLI's tests. Run ` +
        "pnpm exec turbo run test --filter=halonic again; if a part's worker didn't start, " +
        "the machine was too busy (see docs/guides/checks.md):\n" +
        unrun.map((file) => `  - ${relative(process.cwd(), file)}`).join("\n"),
    );
    process.exitCode = 1;
  }
}

const packageTest = packageConfig.test ?? {};

export default {
  ...packageConfig,
  test: {
    ...packageTest,
    reporters: [
      ...[packageTest.reporters ?? []].flat(),
      new AllTestFilesRanReporter(packageTest.include ?? []),
    ],
  },
} satisfies ViteUserConfig;
