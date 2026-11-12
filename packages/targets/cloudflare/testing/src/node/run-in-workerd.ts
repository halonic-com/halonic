// For the requirement and assertion tags verifies() adds to Vitest's TaskMeta.
import type {} from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import type { CaseResult, CaseTree } from "../worker/protocol.ts";
import { buildTestWorker } from "./build-test-worker.ts";
import { WorkerdRunner } from "./workerd-runner.ts";

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
 * @throws Error when the Worker doesn't build or start, or registers no cases
 *
 * @example
 * await runSuitesInWorkerd([new URL("./worker/suites/clock.ts", import.meta.url)]);
 */
export async function runSuitesInWorkerd(suiteFiles: readonly (string | URL)[]): Promise<void> {
  const script = await buildTestWorker(suiteFiles);
  const runner = await WorkerdRunner.start(script);
  afterAll(() => runner.stop());
  const tree = await runner.cases();
  if (tree.children.length === 0) {
    throw new Error(
      "The test Worker registered no cases. Does each suite file call a contract suite?",
    );
  }
  mirror(tree.children, runner);
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
