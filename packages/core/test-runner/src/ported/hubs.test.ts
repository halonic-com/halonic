// The old runner's hubs suite, through `runWorkspaceTests`: two hubs share a
// workspace and its mailbox. What a hub takes from the workspace, `uses`, and
// extracting a hub are the loader's and `halonic extract`'s, so they are
// tested there, not here.

import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { promptsOf, recordingDeps } from "../test/fakes.ts";
import { MemorySource } from "../test/memory-source.ts";
import type { TestInput } from "../test-deps.ts";

/** A one-step workflow of a hub, whose agent the test names. */
function inbox(agent: string): string {
  return `id: inbox
name: Inbox
initial: s
states:
  s: { type: task, agent: ${agent}, input: Check the post, output: summary, on: [{ to: end }] }
  end: { type: final }
`;
}

// Family uses the shared mailbox; Investing has a workflow of the same id.
const files = {
  "workspace.yaml": "id: fo\nname: Family office\nprivacy: { localOnly: true }\n",
  "library/connectors/mailbox.connector.yaml":
    'id: mailbox\nname: Mailbox\ntransport: { http: { url: "http://localhost:9000/mcp" } }\n',
  "hubs/family/hub.yaml": "id: family\nname: Family affairs\n",
  "hubs/family/agents/helper.agent.yaml": "id: helper\nname: Helper\nconnectors: [mailbox]\n",
  "hubs/family/workflows/inbox.workflow.yaml": inbox("helper"),
  "hubs/family/workflows/inbox.test.yaml": `workflow: inbox
cases:
  - name: reads the mailbox
    mocks: { helper: ['tool:list_mail {}', Two letters] }
    events: [approve]
    tools: { mailbox.list_mail: ['[school, bank]'] }
    expect: { final: end, context: { summary: Two letters } }
`,
  "hubs/investing/hub.yaml": "id: investing\nname: Investing\n",
  "hubs/investing/agents/analyst.agent.yaml": "id: analyst\nname: Analyst\n",
  "hubs/investing/workflows/inbox.workflow.yaml": inbox("analyst"),
  "hubs/investing/workflows/inbox.test.yaml": `workflow: inbox
cases:
  - name: reads the statements
    mocks: { analyst: [Steady] }
    expect: { final: end, context: { summary: Steady } }
`,
};

async function twoHubs(): Promise<TestInput> {
  const source = new MemorySource(files);
  const workspace = await loadWorkspace(source);
  expect(workspace.issues).toEqual([]);
  return { workspace, textOf: (path) => source.read(path) };
}

verifies("test-runner.old-suites", () => {
  describe("hubs", () => {
    it("run each hub's tests with that hub's agents and the shared connector", async () => {
      const { deps, models } = recordingDeps();

      const suite = await runWorkspaceTests(await twoHubs(), deps);

      expect(suite.tests.map((test) => [test.hub, test.workflow, test.passed])).toEqual([
        ["family", "inbox", true],
        ["investing", "inbox", true],
      ]);
      expect(promptsOf(models[0])).toEqual([
        ["helper", "Check the post"],
        ["helper", "[school, bank]"],
      ]);
      expect(promptsOf(models[1])).toEqual([["analyst", "Check the post"]]);
    });

    it("run only one hub's tests when the filter names it", async () => {
      const { deps } = recordingDeps();

      const suite = await runWorkspaceTests(
        { ...(await twoHubs()), filter: { hub: "investing" } },
        deps,
      );

      expect(suite.tests.map((test) => [test.hub, test.file])).toEqual([
        ["investing", "hubs/investing/workflows/inbox.test.yaml"],
      ]);
    });
  });
});
