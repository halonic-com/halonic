// For the requirement and assertion tags verifies() adds to Vitest's TaskMeta.
import type {} from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import type { CaseResult, CaseTree } from "../worker/protocol.ts";
import { buildCoveredTestWorker, buildTestWorker } from "./build-test-worker.ts";
import {
  mapToSourceFiles,
  workerdCoverageDirVariable,
  writeWorkerdCoverage,
} from "./workerd-coverage.ts";
import { type WorkerdBindings, WorkerdRunner } from "./workerd-runner.ts";

/** What {@link runSuitesInWorkerd} takes besides the suite files. */
export interface RunSuitesOptions extends WorkerdBindings {
  /**
   * Registers the cases through this function, so a test file can put them
   * under its own `verifies(…)`: `wrap: (register) => verifies("acme.rule", register)`.
   * The requirement guard matches a `verifies` call to the file that ran.
   */
  wrap?: (register: () => void) => void;
}

/** A case that failed inside workerd, with workerd's message and stack. */
export class WorkerdCaseError extends Error {
  override readonly name = "WorkerdCaseError";

  constructor(result: CaseResult) {
    super(result.message ?? "The case failed inside workerd without a message.");
    if (result.stack !== undefined) {
      this.stack = `${this.name}: ${this.message}\n(inside workerd)\n${result.stack}`;
    }
  }
}

/**
 * Runs suite files inside workerd and reports every case to Vitest as its
 * own test, under the same `describe` blocks and requirement tags, so the
 * trace check and the requirement guard see them as usual. Call it with
 * `await` at the top of a test file.
 *
 * @param suiteFiles - absolute paths or `file:` URLs of the suite files (see `buildTestWorker`)
 * @param options - bindings for the Worker's `env` (see `WorkerdBindings`), and `wrap`
 * @throws Error when the Worker doesn't build or start, or registers no cases
 *
 * @example
 * await runSuitesInWorkerd([new URL("./worker/suites/clock.ts", import.meta.url)]);
 */
export async function runSuitesInWorkerd(
  suiteFiles: readonly (string | URL)[],
  options: RunSuitesOptions = {},
): Promise<void> {
  const { wrap = (register) => register(), ...bindings } = options;
  // Set for a coverage run (see `workerdCoverageDirVariable`): build the Worker to count what runs.
  const coverageDir = process.env[workerdCoverageDirVariable];
  const build = coverageDir === undefined ? undefined : await buildCoveredTestWorker(suiteFiles);
  const runner =
    build === undefined
      ? await WorkerdRunner.start(await buildTestWorker(suiteFiles), bindings)
      : await WorkerdRunner.start(build.script, bindings, { coverage: true });
  afterAll(async () => {
    try {
      if (build !== undefined && coverageDir !== undefined) {
        const counted = await mapToSourceFiles(await runner.coverage(), build);
        await writeWorkerdCoverage(coverageDir, counted);
      }
    } finally {
      await runner.stop();
    }
  });
  // If collection fails, the file fails before any test runs and afterAll may never run.
  try {
    const tree = await runner.cases();
    if (tree.children.length === 0) {
      throw new Error(
        "The test Worker registered no cases. Does each suite file call a contract suite?",
      );
    }
    wrap(() => mirror(tree.children, runner));
  } catch (error) {
    await runner.stop();
    throw error;
  }
}

function mirror(nodes: readonly CaseTree[], runner: WorkerdRunner): void {
  for (const node of nodes) {
    if (node.kind === "suite") {
      describe(node.name, { meta: node.meta }, () => mirror(node.children, runner));
      continue;
    }
    it(node.name, async (context) => {
      const result = await runner.run(node.id);
      if (result.status === "failed") {
        throw new WorkerdCaseError(result);
      }
      expect(result.status).toBe("passed");
      // The requirement guard reads how many checks the case made; those ran inside workerd.
      context.task.meta.assertions = result.assertions;
    });
  }
}
