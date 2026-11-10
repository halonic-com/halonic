// The old runner's timers suite, through `runWorkspaceTests`: a wait that
// sends a reminder after two days and gives up after seven.

import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runWorkspaceTests } from "../run-tests.ts";
import { fakeDeps } from "../test/fakes.ts";
import { agent, testFile, testInput, workflow } from "../test/workspaces.ts";

const approveWorkflow = workflow(
  "approve",
  `id: approve
name: Approve
initial: draft
states:
  draft: { type: task, agent: writer, output: text, on: [{ to: review }] }
  review:
    type: wait
    on:
      - { to: sent, event: approve }
      - { to: remind, after: 2d }
      - { to: dropped, after: 7d }
  remind: { type: task, agent: writer, input: "Remind: {{context.text}}", output: reminder, on: [{ to: review }] }
  sent: { type: final }
  dropped: { type: final }
`,
);

const approveTests = testFile(
  "approve",
  `workflow: approve
cases:
  - name: nobody answers for two days, a reminder goes out, then it is approved
    mocks: { writer: [draft, nudge] }
    events: [{ advance: 1d }, { advance: 1d }, approve]
    expect: { final: sent, states: [draft, review, remind, review, sent], context: { reminder: nudge } }
  - name: one day is too early for a reminder
    mocks: { writer: [draft] }
    events: [{ advance: 1d }]
    expect: { final: sent, context: { reminder: nudge } }
`,
);

verifies("test-runner.old-suites", () => {
  describe("timers", () => {
    it("can be tested with advance steps", async () => {
      const input = await testInput(agent("writer"), approveWorkflow, approveTests);

      const [reminded] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(reminded?.failures).toEqual([]);
      const fired = (reminded?.runs[0]?.events ?? []).filter(
        (event) => event.type === "timer.fired",
      );
      // The case's clock starts at 10 Nov 09:00; the 2d timer is due two days later.
      expect(fired).toMatchObject([
        { state: "review", after: "2d", at: "2026-11-12T09:00:00.000Z" },
      ]);
    });

    it("fail a case whose timer isn't due yet, with what the run did instead", async () => {
      const input = await testInput(agent("writer"), approveWorkflow, approveTests);

      const [, early] = (await runWorkspaceTests(input, fakeDeps())).tests;

      expect(early).toMatchObject({ file: "hubs/billing/workflows/approve.test.yaml", line: 7 });
      expect(early?.failures).toEqual([
        { kind: "status", expected: "completed", actual: "waiting", step: "review" },
        { kind: "context", path: "reminder", expected: "nudge", set: false },
      ]);
      // The run still waits on the reminder, due one more day on.
      expect(early?.runs[0]?.summary.nextTimer).toBe("2026-11-12T09:00:00.000Z");
    });
  });
});
