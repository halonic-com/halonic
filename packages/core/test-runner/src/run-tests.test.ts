import type { RunEvent } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "./run-tests.ts";
import { FakeBlobStore, FakeRunStore, fakeDeps, fakeModel } from "./test/fakes.ts";
import {
  agent,
  approvalWorkflow,
  draftWorkflow,
  testFile,
  testInput,
  workflow,
} from "./test/workspaces.ts";

const approvalTests = testFile(
  "approval",
  `workflow: approval
cases:
  - name: approve
    events: [approve]
    expect: { final: approved, states: [decide, approved] }
  - name: the timer fires after two days
    events: [{ advance: 1d }, { advance: 1d }]
    expect: { final: expired }
  - name: one day is not enough
    events: [{ advance: 1d }]
    expect: { status: waiting }
`,
);

verifies("test-runner.run-tests", () => {
  describe("runWorkspaceTests", () => {
    it("runs every case and gives each result as data", async () => {
      const input = await testInput(workflow("approval", approvalWorkflow), approvalTests);

      const suite = await runWorkspaceTests(input, fakeDeps());

      expect(suite).toMatchObject({ passed: 3, failed: 0, durationMs: 0 });
      expect(suite.tests.map((test) => [test.name, test.line, test.passed])).toEqual([
        ["approve", 3, true],
        ["the timer fires after two days", 6, true],
        ["one day is not enough", 9, true],
      ]);
      expect(suite.tests[0]).toMatchObject({
        hub: "billing",
        workflow: "approval",
        file: "hubs/billing/workflows/approval.test.yaml",
        failures: [],
        runId: "test_1",
        durationMs: 0,
      });
      expect(suite.tests[0]?.runs[0]?.summary).toMatchObject({ id: "test_1", kind: "test" });
    });

    it("starts each case's clock at the given time and moves it only on advance", async () => {
      const input = await testInput(workflow("approval", approvalWorkflow), approvalTests);

      const suite = await runWorkspaceTests(input, fakeDeps());

      const timed = suite.tests[1]?.runs[0]?.events ?? [];
      expect(timed[0]).toMatchObject({ type: "run.started", at: "2026-11-10T09:00:00.000Z" });
      expect(timed.find((event) => event.type === "timer.fired")).toMatchObject({
        at: "2026-11-12T09:00:00.000Z",
      });
      // The third case starts again at the given time: its clock is its own.
      expect(suite.tests[2]?.runs[0]?.summary.startedAt).toBe("2026-11-10T09:00:00.000Z");
    });

    it("runs only the cases the filter keeps", async () => {
      const input = await testInput(workflow("approval", approvalWorkflow), approvalTests);

      const suite = await runWorkspaceTests({ ...input, filter: { name: "approve" } }, fakeDeps());

      expect(suite.tests.map((test) => test.name)).toEqual(["approve"]);
    });

    it("sends an event with its payload", async () => {
      const input = await testInput(
        workflow("approval", approvalWorkflow),
        testFile(
          "approval",
          `workflow: approval
cases:
  - name: approve with a comment
    events: [{ event: approve, payload: { comment: Fine } }]
    expect: { final: approved }
`,
        ),
      );

      const suite = await runWorkspaceTests(input, fakeDeps());

      expect(suite.tests[0]?.passed).toBe(true);
      expect(suite.tests[0]?.runs[0]?.events).toContainEqual(
        expect.objectContaining({
          type: "event.received",
          event: "approve",
          payload: { comment: "Fine" },
        }),
      );
    });

    it("fails a case whose event the run doesn't take, and sends no later event", async () => {
      const input = await testInput(
        workflow("approval", approvalWorkflow),
        testFile(
          "approval",
          `workflow: approval
cases:
  - name: an event the wait doesn't know
    events: [reject, approve]
    expect: { status: waiting }
  - name: an event after the end
    events: [approve, approve]
    expect: { final: approved }
`,
        ),
      );

      const [unknown, afterEnd] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(unknown?.failures).toEqual([
        { kind: "event-not-delivered", event: "reject", status: "waiting" },
      ]);
      expect(received(unknown?.runs[0]?.events)).toEqual([]);
      expect(afterEnd?.failures).toEqual([
        { kind: "event-not-delivered", event: "approve", status: "completed" },
      ]);
    });

    it("gives a case's child runs after its own, and passes its events on to them", async () => {
      const input = await testInput(
        agent("writer"),
        workflow("approval", approvalWorkflow),
        workflow("draft", draftWorkflow),
        testFile(
          "draft",
          `workflow: draft
cases:
  - name: the note is approved
    input: { topic: paper }
    mocks: { writer: [A note on paper.] }
    events: [approve]
    expect: { final: done, states: [write, review, done], context: { note: A note on paper. } }
`,
        ),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures).toEqual([]);
      const [own, child] = test?.runs ?? [];
      expect(test?.runs).toHaveLength(2);
      expect(child?.summary).toMatchObject({ parentRunId: own?.id, status: "completed" });
      expect(received(child?.events)).toEqual(["approve"]);
    });

    it("fails a case whose step would start a program, naming only that step", async () => {
      const input = await testInput(
        agent("coder", "harness: codex\n"),
        workflow(
          "fix",
          `id: fix
name: Fix
initial: code
states:
  code: { type: task, agent: coder, input: "Fix it", on: [{ to: done }] }
  done: { type: final }
`,
        ),
        testFile("fix", "workflow: fix\ncases:\n  - name: fixes\n    expect: { final: done }\n"),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures).toEqual([{ kind: "unscripted-program", step: "code" }]);
    });

    it("checks artifacts against the files the run saved", async () => {
      const input = await testInput(
        agent("notifier"),
        workflow(
          "notify",
          `id: notify
name: Notify
initial: write
states:
  write:
    type: task
    agent: notifier
    input: "Announce it"
    artifact: { name: note.md }
    on: [{ to: done }]
  done: { type: final }
`,
        ),
        testFile(
          "notify",
          `workflow: notify
cases:
  - name: saves the note
    mocks: { notifier: [Paid Acme Paper.] }
    expect: { final: done, artifacts: [note.md] }
  - name: saves no receipt
    mocks: { notifier: [Paid Acme Paper.] }
    expect: { artifacts: [receipt.pdf] }
`,
        ),
      );

      const [saved, missing] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(saved?.failures).toEqual([]);
      expect(missing?.failures).toEqual([
        { kind: "artifacts", expected: "receipt.pdf", saved: ["note.md"] },
      ]);
    });

    it("reports scripted replies the runs never asked for", async () => {
      const input = await testInput(
        workflow("approval", approvalWorkflow),
        testFile(
          "approval",
          `workflow: approval
cases:
  - name: approve
    mocks: { writer: [unused, also unused] }
    events: [approve]
    expect: { final: approved }
`,
        ),
      );

      const [test] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(test?.failures).toEqual([{ kind: "unused-replies", agent: "writer", count: 2 }]);
    });

    it("turns an engine error into a failed result", async () => {
      const input = await testInput(workflow("approval", approvalWorkflow), approvalTests);
      const broken: RunStore = Object.assign(new FakeRunStore(), {
        append: async () => {
          throw new Error("The disk is full.");
        },
      });

      const suite = await runWorkspaceTests(
        { ...input, filter: { name: "approve" } },
        fakeDeps({ stores: () => ({ runs: broken, blobs: new FakeBlobStore() }) }),
      );

      expect(suite).toMatchObject({ passed: 0, failed: 1 });
      expect(suite.tests[0]).toMatchObject({
        runId: null,
        runs: [],
        failures: [{ kind: "error", message: "The disk is full." }],
      });
    });

    it("gives every agent the case's scripted model, made from its mocks", async () => {
      const input = await testInput(
        agent("writer"),
        workflow("approval", approvalWorkflow),
        workflow("draft", draftWorkflow),
        testFile(
          "draft",
          `workflow: draft
cases:
  - name: drafts
    input: { topic: ink }
    mocks: { writer: [Ink.] }
    expect: { status: waiting }
`,
        ),
      );
      const models: ReturnType<typeof fakeModel>[] = [];

      await runWorkspaceTests(
        input,
        fakeDeps({
          model: (script) => {
            const model = fakeModel(script);
            models.push(model);
            return model;
          },
        }),
      );

      expect(models).toHaveLength(1);
      expect(models[0]?.requests.map((request) => request.meta?.agentId)).toEqual(["writer"]);
    });
  });
});

/** The events a run received, by name. */
function received(events: readonly RunEvent[] | undefined): string[] {
  return (events ?? []).flatMap((event) => (event.type === "event.received" ? [event.event] : []));
}
