import type { RunSummary, RunTrigger } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunRoutine, RunWorkflow } from "../api.ts";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { type RunRow, runRow } from "./run-row.ts";

const supportReply: RunWorkflow = {
  name: "Support reply",
  stepDescription: (stateId) =>
    stateId === "review" ? "Approve this reply?\n{{reply}}" : undefined,
};

function rowOf(changes: Partial<RunSummary>, madeToolCalls = true): RunRow {
  return runRow(
    { summary: summaryWith(changes), madeToolCalls },
    { workflow: supportReply, routine: undefined, currency: "EUR", now: mondayMorning },
  );
}

verifies("runs.row", () => {
  describe("runRow", () => {
    it("names the step a running run is in, with a live chip", () => {
      const row = rowOf({ status: "running", state: "draft" });

      expect(row.chip).toEqual({ word: "Running", tone: "running", dot: true });
      expect(row.line).toBe("In Draft");
      expect(row.shortId).toBe("01jd8q");
      expect(row.workflow).toBe("Support reply");
      expect(row.test).toBe(false);
    });

    it("says how many approvals a run waits for", () => {
      const row = rowOf({ status: "waiting", approvals: [approvalAt(1), approvalAt(2)] });

      expect(row.chip).toEqual({ word: "Needs you", tone: "warning", dot: true });
      expect(row.line).toBe("Waiting for 2 approvals");
    });

    it("names the step whose agent asked for one approval", () => {
      expect(rowOf({ status: "running", approvals: [approvalAt(1)] }).line).toBe(
        "Waiting for your approval in the step Send",
      );
    });

    it("reads a wait step by the first line of its description, else by the step", () => {
      const described = rowOf({
        status: "waiting",
        state: "review",
        accepts: ["approve", "reject"],
        waitingFor: { title: "Approve this reply?", body: "" },
      });
      const plain = rowOf({ status: "waiting", state: "check", accepts: ["approve"] });

      expect(described.line).toBe("Waiting for you: Approve this reply?");
      expect(plain.line).toBe("Waiting for you in the step Check");
    });

    it("says when a timer is due and which child run a run waits for, with a grey chip", () => {
      const timer = rowOf({
        status: "waiting",
        nextTimer: new Date(2026, 10, 9, 14, 0).toISOString(),
      });
      const child = rowOf({ status: "waiting", waitingOn: "run_mfx3k9z0_7k2m9p" });

      expect(timer.chip).toEqual({ word: "Waiting", tone: "neutral", dot: false });
      expect(timer.line).toBe("Waiting until 14:00");
      expect(child.line).toBe("Waiting for child run 7k2m9p");
    });

    it("says a finished run without a tool call sent nothing, then its cost", () => {
      const row = rowOf({ status: "completed", cost: 0.004 }, false);

      expect(row.chip).toEqual({ word: "Done", tone: "success", dot: false });
      expect(row.line).toBe("Sent nothing · estimated cost €0.004");
    });

    it("names the calls without a price after the cost, and never shows €0.00", () => {
      const someUnpriced = rowOf({ status: "completed", cost: 0.03, unpricedCalls: 2 });
      const noneUnpriced = rowOf({ status: "completed", cost: 0, unpricedCalls: 3 });

      expect(someUnpriced.line).toBe("Estimated cost €0.03 (+2 calls without a price)");
      expect(noneUnpriced.line).toBe("3 calls without a price");
    });

    it("names the step a run on the test model finished in, with no amount", () => {
      expect(rowOf({ status: "completed", state: "send", cost: 0 }).line).toBe("Finished in Send");
    });

    it("gives a failed run the failed banner's first sentence", () => {
      const row = rowOf({ status: "failed", reason: "model-missing" });

      expect(row.chip).toEqual({ word: "Failed", tone: "danger", dot: false });
      expect(row.line).toBe("Support reply failed in the step Draft.");
    });

    it("says where and after how long a run stopped at its budget or was cancelled", () => {
      const ended = { endedAt: minutesLater(3), cost: 5.08 };
      const budget = rowOf({ status: "failed", reason: "budget", ...ended });
      const cancelled = rowOf({ status: "failed", reason: "cancelled", ...ended, cost: 0 });

      expect(budget.chip).toEqual({ word: "Stopped · budget", tone: "warning", dot: false });
      expect(budget.line).toBe("Budget reached in Draft after 3 min · estimated cost €5.08");
      expect(cancelled.chip).toEqual({ word: "Stopped", tone: "neutral", dot: false });
      expect(cancelled.line).toBe("Cancelled in Draft after 3 min");
    });

    it("names a workflow that's gone by its id, and marks a test run", () => {
      const row = runRow(
        { summary: summaryWith({ kind: "test" }), madeToolCalls: false },
        { workflow: undefined, routine: undefined, currency: "EUR", now: mondayMorning },
      );

      expect(row.workflow).toBe("support-reply");
      expect(row.test).toBe(true);
    });
  });
});

verifies("runs.row-columns", () => {
  it("gives when it started, how long it took once it ended, and the sentence a screen reader hears", () => {
    const live = rowOf({ status: "waiting", approvals: [approvalAt(1), approvalAt(2)] });
    const ended = rowOf({ kind: "test", status: "completed", endedAt: minutesLater(3) }, false);
    const failed = rowOf({ status: "failed", reason: "model-missing", endedAt: minutesLater(1) });

    expect(live.time).toBe("10:40");
    expect(live.took).toBeUndefined();
    expect(live.label).toBe(
      "Run 01jd8q, Support reply, needs you, waiting for 2 approvals. Started by you, in the terminal, 10:40.",
    );
    expect(ended.took).toBe("took 3 min");
    expect(ended.label).toBe(
      "Run 01jd8q, Support reply, done, sent nothing. Started by a test case, 10:40, test run.",
    );
    expect(failed.label).toBe(
      "Run 01jd8q, Support reply, failed in the step Draft. Started by you, in the terminal, 10:40.",
    );
  });

  describe("Started by", () => {
    const morningBrief: RunRoutine = { name: "Morning brief", schedule: "Weekdays at 08:00" };
    const triggered = (trigger: RunTrigger, routine?: RunRoutine) =>
      runRow(
        { summary: summaryWith({ trigger }), madeToolCalls: false },
        { workflow: supportReply, routine, currency: "EUR", now: mondayMorning },
      );
    const at = minutesLater(0);
    const routineId = "acme/morning-brief";

    it("says what started a run, from its trigger", () => {
      expect(triggered({ type: "manual", at }).startedBy).toBe("You, with Run");
      expect(triggered({ type: "mail", at, messageId: "m1" }).startedBy).toBe("A message arrived");
      expect(triggered({ type: "signal", at, signalId: "run_1:4" }).startedBy).toBe(
        "A signal arrived",
      );
      expect(rowOf({ trigger: null }).startedBy).toBe("You, in the terminal");
      expect(triggered({ type: "manual", at }).startedByTooltip).toBeUndefined();
    });

    it("gives the sentence its own words for what started the run", () => {
      const heard = (row: RunRow) => row.label.slice(row.label.indexOf("Started by"));

      expect(heard(triggered({ type: "manual", at }))).toBe("Started by you, with Run, 10:40.");
      expect(heard(triggered({ type: "mail", at, messageId: "m1" }))).toBe(
        "Started by a message, 10:40.",
      );
      expect(heard(triggered({ type: "signal", at, signalId: "run_1:4" }))).toBe(
        "Started by a signal, 10:40.",
      );
      expect(heard(rowOf({ parentRunId: "run_mfx3k2a1_7k2m9p" }))).toBe(
        "Started by run 7k2m9p, 10:40.",
      );
    });

    it("says a routine's schedule, with the routine's name in the tooltip", () => {
      const scheduled = triggered({ type: "schedule", at, routineId }, morningBrief);
      const every = triggered(
        { type: "every", at, routineId },
        { name: "Inbox sweep", schedule: "Every 2 hours (UTC)" },
      );
      const gone = triggered({ type: "schedule", at, routineId });

      expect(scheduled.startedBy).toBe("Schedule · weekdays at 08:00");
      expect(scheduled.startedByTooltip).toBe("Morning brief");
      expect(scheduled.label).toBe(
        "Run 01jd8q, Support reply, running, in Draft. Started by the schedule, weekdays at 08:00, 10:40.",
      );
      expect(every.startedBy).toBe("Schedule · every 2 hours (UTC)");
      expect(gone.startedBy).toBe("Schedule");
      expect(gone.startedByTooltip).toBe(routineId);
    });

    it("says a catch-up run caught up after sleep, with the routine's name in the tooltip", () => {
      const row = triggered(
        { type: "schedule", at, routineId, catchUp: { skipped: 61 } },
        morningBrief,
      );

      expect(row.startedBy).toBe("Caught up after sleep");
      expect(row.startedByTooltip).toBe("Morning brief");
      expect(row.label).toBe(
        "Run 01jd8q, Support reply, running, in Draft. Started by a catch-up after sleep, 10:40.",
      );
    });

    it("names a test run's case, and a child run's parent by its short id", () => {
      const named = runRow(
        {
          summary: summaryWith({ kind: "test" }),
          madeToolCalls: false,
          testCase: "Refund over €100",
        },
        { workflow: supportReply, routine: undefined, currency: "EUR", now: mondayMorning },
      );

      expect(named.startedBy).toBe("Test “Refund over €100”");
      expect(named.label).toBe(
        "Run 01jd8q, Support reply, running, in Draft. Started by the test case “Refund over €100”, 10:40, test run.",
      );
      expect(rowOf({ kind: "test" }).startedBy).toBe("A test case");
      expect(rowOf({ parentRunId: "run_mfx3k2a1_7k2m9p" }).startedBy).toBe("Run 7k2m9p");
    });
  });
});
