// The old runner's knowledge suite checked how the engine puts an agent's
// knowledge sources into its prompt; those checks are the engine's
// (`engine.knowledge-auto`, `engine.knowledge-tools`). The runner doesn't
// build an agent's sources yet (see "Differences from the old runner" in the
// README), so what is ported here is the search tool a caller gives.

import type { HalonicTool } from "@halonicjs/engine";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { promptsOf, recordingDeps } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";

/** A handbook search that finds one passage, and keeps the queries it got. */
function handbookSearch(queries: unknown[]): HalonicTool {
  return {
    definition: {
      name: "knowledge_search",
      description: "Search the support handbook",
      parameters: { type: "object", properties: { query: { type: "string" } } },
    },
    run: async (args) => {
      queries.push(args["query"]);
      return "[handbook/refunds.md] Refunds take 3 days.";
    },
  };
}

verifies("test-runner.old-suites", () => {
  describe("knowledge", () => {
    it("lets an agent search the knowledge the caller gives, and answer from it", async () => {
      const input = await testInput(
        agent("helper"),
        workflow(
          "ask",
          `id: ask
name: Ask
initial: s
states:
  s: { type: task, agent: helper, input: How long do refunds take?, output: answer, on: [{ to: end }] }
  end: { type: final }
`,
        ),
        testFile(
          "ask",
          `workflow: ask
cases:
  - name: searches the handbook first
    mocks: { helper: ['tool:knowledge_search {"query": "refund time"}', Three days.] }
    expect: { final: end, context: { answer: Three days. } }
`,
        ),
      );
      const queries: unknown[] = [];
      const { deps, models } = recordingDeps({ halonicTools: [handbookSearch(queries)] });

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(queries).toEqual(["refund time"]);
      expect(promptsOf(models[0])[1]).toEqual([
        "helper",
        "[handbook/refunds.md] Refunds take 3 days.",
      ]);
    });
  });
});
