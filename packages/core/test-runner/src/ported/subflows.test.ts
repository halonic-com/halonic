// The old runner's subflows suite, through `runWorkspaceTests`: a parent
// runs a draft workflow as one step, and a person approves the draft.

import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { fakeDeps, promptsOf, recordingDeps } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";

/** The child: a writer drafts, then a person approves or rejects. */
const draft = workflow(
  "draft",
  `id: draft
name: Draft
initial: write
states:
  write: { type: task, agent: writer, input: "Write about {{input.topic}}", output: text, on: [{ to: review }] }
  review: { type: wait, on: [{ to: ok, event: approve }, { to: rejected, event: reject }] }
  ok: { type: final }
  rejected: { type: final }
`,
);

/** The parent: runs the child as one step, then a checker reads its output. */
const publish = workflow(
  "publish",
  `id: publish
name: Publish
initial: draft
states:
  draft:
    type: workflow
    workflow: draft
    input: { topic: "{{input.subject}}" }
    output: drafted
    on: [{ to: check }]
  check: { type: task, agent: checker, input: "Check: {{context.drafted.text}}", output: verdict, on: [{ to: end }] }
  end: { type: final }
`,
);

const parts = [agent("writer"), agent("checker"), draft, publish];

verifies("test-runner.old-suites", () => {
  describe("subflows", () => {
    it("pass a case whose event reaches the waiting child through the parent", async () => {
      const input = await testInput(
        ...parts,
        testFile(
          "publish",
          `workflow: publish
cases:
  - name: the child waits; the approval reaches it through the parent
    input: { subject: tides }
    mocks: { writer: [A draft about tides], checker: [fine] }
    events: [approve]
    expect: { final: end, states: [draft, check, end], context: { drafted: { text: A draft about tides }, verdict: fine } }
`,
        ),
      );
      const { deps, models } = recordingDeps();

      const [test] = (await runWorkspaceTests(input, deps)).tests;

      expect(test?.failures).toEqual([]);
      expect(promptsOf(models[0])).toEqual([
        ["writer", "Write about tides"],
        ["checker", "Check: A draft about tides"],
      ]);
      const [parent, child] = test?.runs ?? [];
      expect(child?.summary).toMatchObject({
        workflowId: "draft",
        parentRunId: parent?.id,
        status: "completed",
        state: "ok",
      });
      expect(parent?.events.map((event) => event.type)).toEqual(
        expect.arrayContaining(["workflow.started", "run.waiting", "workflow.finished"]),
      );
    });

    it("show the parent waiting in the step that runs the child", async () => {
      const input = await testInput(
        ...parts,
        testFile(
          "publish",
          `workflow: publish
cases:
  - name: nobody has approved yet
    input: { subject: tides }
    mocks: { writer: [A draft about tides] }
    expect: { final: end }
`,
        ),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures).toEqual([
        { kind: "status", expected: "completed", actual: "waiting", step: "draft" },
      ]);
      expect(test?.runs[1]?.summary).toMatchObject({ status: "waiting", state: "review" });
    });

    it("fail the parent's case with the child's error when the child fails", async () => {
      const input = await testInput(
        ...parts.slice(1),
        agent("writer", "output: { type: choice, options: [yes, no] }\n"),
        testFile(
          "publish",
          `workflow: publish
cases:
  - name: the writer gives no option
    input: { subject: tides }
    mocks: { writer: [maybe] }
    expect: { context: { verdict: fine } }
`,
        ),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures).toEqual([
        { kind: "context", path: "verdict", expected: "fine", set: false },
        {
          kind: "error",
          message: expect.stringMatching(/^Workflow "draft" failed: .*"yes", "no"/),
        },
      ]);
      expect(test?.runs.map((run) => run.summary.status)).toEqual(["failed", "failed"]);
    });
  });
});
