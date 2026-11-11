import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunWorkflow } from "../api.ts";
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
    { workflow: supportReply, currency: "EUR", now: mondayMorning },
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
        { workflow: undefined, currency: "EUR", now: mondayMorning },
      );

      expect(row.workflow).toBe("support-reply");
      expect(row.test).toBe(true);
    });
  });
});
