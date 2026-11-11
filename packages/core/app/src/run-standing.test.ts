import type { PendingApproval, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runStanding, runWait } from "./run-standing.ts";

/** A summary of an Acme Support reply run, changed by `changes`. */
function summaryWith(changes: Partial<RunSummary>): RunSummary {
  return {
    id: "run_mfx3k2a1_01jd8q",
    hubId: "acme",
    workflowId: "support-reply",
    kind: "run",
    status: "running",
    state: "draft",
    startedAt: "2026-11-09T10:40:00.000Z",
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: ["read", "classify", "draft"],
    context: {},
    error: null,
    reason: null,
    definitionsVersion: "v1",
    trigger: null,
    parentRunId: null,
    waitingOn: null,
    accepts: [],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
    lastWaitingAt: null,
    approvals: [],
    signals: [],
    cantTry: [],
    lastSeq: 7,
    updatedAt: "2026-11-09T10:42:00.000Z",
    ...changes,
  };
}

function approval(callId: string, at: string): PendingApproval {
  return {
    agent: "reporter",
    tool: "gmail_send",
    args: {},
    callId,
    at,
    state: "send",
    branch: null,
    item: null,
  };
}

const firstApproval = approval("call-1", "2026-11-09T10:41:00.000Z");
const secondApproval = approval("call-2", "2026-11-09T10:42:00.000Z");
const twoPm = "2026-11-09T14:00:00.000Z";

verifies("app.run-standing", () => {
  describe("runStanding", () => {
    it("says a running run with an open approval needs you", () => {
      const summary = summaryWith({ status: "running", approvals: [firstApproval] });

      expect(runStanding(summary)).toBe("needs-you");
      expect(runWait(summary)).toEqual({ kind: "approvals", oldest: firstApproval, count: 1 });
    });

    it("says a running run without approvals is running and waits for nothing", () => {
      const summary = summaryWith({ status: "running" });

      expect(runStanding(summary)).toBe("running");
      expect(runWait(summary)).toEqual({ kind: "none" });
    });

    it("says a run waiting at a step that takes events needs you", () => {
      const summary = summaryWith({ status: "waiting", state: "review", accepts: ["approve"] });

      expect(runStanding(summary)).toBe("needs-you");
    });

    it("says a run waiting for a child run or a timer is waiting", () => {
      expect(runStanding(summaryWith({ status: "waiting", waitingOn: "run_x_7k2m9p" }))).toBe(
        "waiting",
      );
      expect(runStanding(summaryWith({ status: "waiting", nextTimer: twoPm }))).toBe("waiting");
    });

    it("tells a budget stop and a cancelled run from a failure", () => {
      expect(runStanding(summaryWith({ status: "failed", reason: "budget" }))).toBe("budget");
      expect(runStanding(summaryWith({ status: "failed", reason: "cancelled" }))).toBe("cancelled");
      expect(runStanding(summaryWith({ status: "failed", reason: "model-missing" }))).toBe(
        "failed",
      );
      expect(runStanding(summaryWith({ status: "failed", reason: null }))).toBe("failed");
    });

    it("says a completed run is done and a run that couldn't try is cant-try", () => {
      expect(runStanding(summaryWith({ status: "completed" }))).toBe("done");
      expect(runStanding(summaryWith({ status: "cant-try" }))).toBe("cant-try");
    });
  });

  describe("runWait", () => {
    it("gives the oldest of several open approvals and how many there are", () => {
      const summary = summaryWith({
        status: "waiting",
        approvals: [firstApproval, secondApproval],
        accepts: ["approve", "reject"],
      });

      expect(runWait(summary)).toEqual({ kind: "approvals", oldest: firstApproval, count: 2 });
    });

    it("puts a child run before the events it passes on", () => {
      const summary = summaryWith({
        status: "waiting",
        waitingOn: "run_x_7k2m9p",
        accepts: ["approve"],
      });

      expect(runWait(summary)).toEqual({ kind: "child-run", runId: "run_x_7k2m9p" });
      expect(runStanding(summary)).toBe("waiting");
    });

    it("gives a wait step its description, events and timer", () => {
      const summary = summaryWith({
        status: "waiting",
        state: "review",
        accepts: ["approve", "reject"],
        nextTimer: twoPm,
        waitingFor: { title: "Approve this reply?", body: "" },
      });

      expect(runWait(summary)).toEqual({
        kind: "step",
        state: "review",
        title: "Approve this reply?",
        events: ["approve", "reject"],
        until: twoPm,
      });
    });

    it("gives a wait step without a description no title", () => {
      const summary = summaryWith({
        status: "waiting",
        state: "review",
        accepts: ["approve"],
        waitingFor: { title: "", body: "" },
      });

      expect(runWait(summary)).toMatchObject({ kind: "step", title: null });
    });

    it("gives a timer when that's all the run waits for", () => {
      expect(runWait(summaryWith({ status: "waiting", nextTimer: twoPm }))).toEqual({
        kind: "timer",
        at: twoPm,
      });
    });

    it("waits for nothing once the run has ended or has nothing to wait for", () => {
      expect(runWait(summaryWith({ status: "completed", nextTimer: twoPm }))).toEqual({
        kind: "none",
      });
      expect(runWait(summaryWith({ status: "waiting" }))).toEqual({ kind: "none" });
    });
  });
});
