// The old runner's foreach suite, through `runWorkspaceTests`: one summary
// per attachment of a mail, by an agent or by a workflow per item.

import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { promptsOf, recordingDeps } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";

/** The inbox workflow, with its for-each step's own keys. */
function inbox(step: string) {
  return workflow(
    "inbox",
    `id: inbox
name: Inbox
initial: each
states:
  each:
    type: foreach
    items: "{{input.files}}"
    as: file
${step}
    on: [{ to: end }]
  end: { type: final }
`,
  );
}

/** One workflow run per file: it reads the file it gets as input. */
const readOne = workflow(
  "one",
  `id: one
name: One
initial: read
states:
  read: { type: task, agent: reader, input: "Read {{input.file.name}}", output: note, on: [{ to: end }] }
  end: { type: final }
`,
);

const agentStep = `    agent: reader
    input: "Summarise {{file.name}} ({{index}})"
    output: notes`;

/** The inbox test with one case, whose input and expectation the test gives. */
function inboxCase(body: string) {
  return testFile("inbox", `workflow: inbox\ncases:\n  - name: one summary per file\n${body}`);
}

const threeFiles = "    input: { files: [{ name: a.pdf }, { name: b.pdf }, { name: c.pdf }] }\n";

verifies("test-runner.old-suites", () => {
  describe("for-each steps", () => {
    it("run the agent once per item, in order, and collect the results", async () => {
      const input = await testInput(
        agent("reader"),
        inbox(agentStep),
        inboxCase(`${threeFiles}    mocks: { reader: [A, B, C] }
    expect: { final: end, context: { notes: [A, B, C] } }
`),
      );
      const { deps, models } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(promptsOf(models[0])).toEqual([
        ["reader", "Summarise a.pdf (0)"],
        ["reader", "Summarise b.pdf (1)"],
        ["reader", "Summarise c.pdf (2)"],
      ]);
      const items = (test?.runs[0]?.events ?? []).flatMap((event) =>
        event.type === "agent.started" ? [event.item] : [],
      );
      expect(items).toEqual([0, 1, 2]);
    });

    it("keep the results in item order with concurrency", async () => {
      const input = await testInput(
        agent("reader"),
        inbox(`${agentStep}\n    concurrency: 3`),
        inboxCase(`${threeFiles}    mocks: { reader: [A, B, C] }
    expect: { final: end, context: { notes: [A, B, C] } }
`),
      );
      const { deps } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
    });

    it("run a workflow per item, each a child run of the case", async () => {
      const input = await testInput(
        agent("reader"),
        readOne,
        inbox("    workflow: one\n    output: notes"),
        inboxCase(`${threeFiles}    mocks: { reader: [A, B, C] }
    expect: { final: end, context: { notes: [{ note: A }, { note: B }, { note: C }] } }
`),
      );
      const { deps } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      const [own, ...children] = test?.runs ?? [];
      expect(children.map((child) => child.summary.parentRunId)).toEqual([
        own?.id,
        own?.id,
        own?.id,
      ]);
    });

    it("fail the case when items is not a list, with the step and the run's error", async () => {
      const input = await testInput(
        agent("reader"),
        inbox(agentStep),
        inboxCase(`    input: { files: a.pdf }
    expect: { context: { notes: [] } }
`),
      );
      const { deps } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([
        { kind: "context", path: "notes", expected: [], set: false },
        { kind: "error", message: expect.stringContaining("give a text, not a list") },
      ]);
      expect(test?.runs[0]?.summary).toMatchObject({ status: "failed", state: "each" });
    });
  });
});
