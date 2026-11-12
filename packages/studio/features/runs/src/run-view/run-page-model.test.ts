import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunWorkflow } from "../api.ts";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { type RunPageContext, runBanner, runHeader } from "./run-page-model.ts";

const supportReply: RunWorkflow = {
  name: "Support reply",
  stepDescription: (stateId) => (stateId === "review" ? "Approve this reply?" : undefined),
};

const context: RunPageContext = {
  workflow: supportReply,
  workflowOfRun: (runId) => (runId === "run_child_7k2m9p" ? "Verify" : undefined),
  currency: "EUR",
  now: mondayMorning,
};

function page(changes: Partial<RunSummary>) {
  const run = { summary: summaryWith(changes), madeToolCalls: false };
  return { header: runHeader(run, context), banner: runBanner(run, context) };
}

verifies("runs.run-page", () => {
  describe("the header", () => {
    it("names the run by its short id, with what ran, the chip and when it started", () => {
      expect(page({}).header).toEqual({
        title: "Run 01jd8q",
        kindLabel: "Run · Support reply",
        chip: { word: "Running", tone: "running", dot: true },
        line: "today 10:40 · updates live",
      });
    });

    it("says how long an ended run took, and the day when it wasn't today", () => {
      const yesterday = new Date(2026, 10, 8, 16, 0);
      const ended = new Date(yesterday.getTime() + 130_000);
      const { header } = page({
        status: "completed",
        startedAt: yesterday.toISOString(),
        endedAt: ended.toISOString(),
      });
      expect(header.line).toBe("yesterday 16:00 · took 2 min 10 s");
      expect(page({ startedAt: new Date(2026, 10, 6, 9, 5).toISOString() }).header.line).toBe(
        "Fri 6 Nov 09:05 · updates live",
      );
    });
  });

  describe("the banner", () => {
    it("shows none while the run runs or after it finished", () => {
      expect(page({}).banner).toBeUndefined();
      expect(page({ status: "completed", endedAt: minutesLater(3) }).banner).toBeUndefined();
    });

    it("asks for your approval, amber, with Review in Inbox", () => {
      expect(page({ approvals: [approvalAt(1)] }).banner).toEqual({
        kind: "callout",
        tone: "warning",
        name: "Waiting for you",
        lines: ["Waiting for your approval in the step Send. Nothing runs until you decide."],
        action: { kind: "review-in-inbox" },
      });
      expect(page({ approvals: [approvalAt(1), approvalAt(2)] }).banner).toMatchObject({
        lines: ["Waiting for 2 approvals. Nothing runs until you decide."],
      });
    });

    it("names a wait step by its description, else by the step", () => {
      const atReview = { status: "waiting" as const, state: "review", accepts: ["approve"] };
      expect(
        page({ ...atReview, waitingFor: { title: "Approve this reply?", body: "" } }).banner,
      ).toMatchObject({
        tone: "warning",
        lines: ["Waiting for you: Approve this reply?"],
        action: { kind: "review-in-inbox" },
      });
      expect(page({ ...atReview, state: "await" }).banner).toMatchObject({
        lines: ["Waiting for you in the step Await."],
      });
    });

    it("waits for a time or a child run in the neutral tone", () => {
      expect(page({ status: "waiting", nextTimer: minutesLater(200) }).banner).toEqual({
        kind: "callout",
        tone: "info",
        name: "Waiting",
        lines: ["Waiting until 14:00."],
      });
      expect(page({ status: "waiting", waitingOn: "run_child_7k2m9p" }).banner).toEqual({
        kind: "callout",
        tone: "info",
        name: "Waiting",
        lines: ["Waiting for child run 7k2m9p (Verify)."],
        action: { kind: "open-run", runId: "run_child_7k2m9p", label: "Open run 7k2m9p" },
      });
      expect(page({ status: "waiting", waitingOn: "run_gone_aaaaaa" }).banner).toMatchObject({
        lines: ["Waiting for child run aaaaaa."],
      });
    });

    it("gives a failed run R24's general banner, with the engine's message", () => {
      const failed = { status: "failed" as const, endedAt: minutesLater(1) };
      expect(page({ ...failed, error: "Model refused" }).banner).toEqual({
        kind: "callout",
        tone: "danger",
        name: "Run failed",
        lines: [
          "Support reply failed in the step Draft. Halonic can't tell the cause yet: Model refused.",
        ],
      });
      expect(page({ ...failed, error: null }).banner).toMatchObject({
        lines: ["Support reply failed in the step Draft. Halonic can't tell the cause yet."],
      });
    });

    it("stops at the budget with a warning, not red, and its title", () => {
      const { banner } = page({
        status: "failed",
        reason: "budget",
        error: "The run's budget of €5.00 is reached",
      });
      expect(banner).toEqual({
        kind: "callout",
        tone: "warning",
        name: "Stopped at its budget",
        title: "Stopped at its estimated budget",
        lines: [
          "Support reply stopped in the step Draft: The run's budget of €5.00 is reached.",
          "Halonic checks the budget before each model call, so calls already under way can take a run over it.",
        ],
      });
    });

    it("notes a cancelled run plainly, in its step or before it started", () => {
      const cancelled = { status: "failed" as const, reason: "cancelled" as const };
      expect(page({ ...cancelled, state: "classify" }).banner).toEqual({
        kind: "note",
        text: "Support reply was cancelled in the step Classify. Nothing after it ran.",
      });
      expect(page({ ...cancelled, state: null, statesVisited: [] }).banner).toEqual({
        kind: "note",
        text: "Support reply was cancelled before it started.",
      });
    });
  });
});
