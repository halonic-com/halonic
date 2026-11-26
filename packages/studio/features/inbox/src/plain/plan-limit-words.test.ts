import { type PlanRun, planRunOf, planStopOf } from "@halonicjs/app/run-failure";
import type { RunFailureCause } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { planStop, runAtLimit } from "../plan-limit.test-helper.ts";
import { planLimitMessage } from "./plan-limit-words.ts";

/** The message for a run waiting at `cause`. */
function waitingMessage(cause: RunFailureCause) {
  const run = planRunOf(runAtLimit("r51", cause));
  if (run === undefined) throw new Error("expected a run at a plan limit");
  return planLimitMessage(run);
}

/** The message for a run that failed at `cause` without waiting. */
function stoppedMessage(cause: RunFailureCause) {
  const stop = planStopOf(cause);
  if (stop === undefined) throw new Error("expected a plan stop");
  const run: PlanRun = { state: "stopped", stop };
  return planLimitMessage(run);
}

verifies("inbox.plan-limit-card", () => {
  describe("a run waiting at a plan limit", () => {
    it("words the cost unit as this month's usage, with the day it resets and no upgrade", () => {
      expect(waitingMessage(planStop())).toEqual({
        chip: "Waiting: plan limit reached",
        title: "This run stopped: you've used this month's usage",
        line: "It resets on 2 December.",
      });
    });

    it("words agent time as the customer reads it, and a member's share the same way", () => {
      const minutes = { unit: "harnessMinutes", used: "600", limit: "600" };
      const own = waitingMessage(planStop("plan.harnessMinutes", minutes));
      expect(own?.title).toBe("This run stopped: you've used this month's agent time");
      expect(waitingMessage(planStop("plan.member.harnessMinutes", minutes))).toEqual(own);
    });

    it("says nothing about upgrading even when a bigger plan has more", () => {
      const message = waitingMessage(planStop("plan.cost", { canUpgrade: "true" }));
      expect(message?.line).toBe("It resets on 2 December.");
    });

    it("leaves the line empty when the stop gives no day it resets", () => {
      const { resetsAt: _left, ...detail } = planStop().detail ?? {};
      const cause: RunFailureCause = { kind: "limit_reached", code: "plan.cost", detail };
      expect(waitingMessage(cause)?.line).toBe("");
    });

    it("words a refused reservation before a step as percentages of the month", () => {
      const reserve = { phase: "reserve", used: "9.2", needed: "0.8", left: "0.3" };
      expect(waitingMessage(planStop("plan.cost", reserve))).toEqual({
        chip: "Waiting: plan limit reached",
        title: "This step can't start: not enough usage left this month",
        line: "It needs up to 8% of your monthly usage and you have 3% left. It resets on 2 December.",
      });
    });

    it("says less than 1% left rather than 0%, as some of the limit is still there", () => {
      const reserve = { phase: "reserve", used: "9.97", needed: "0.8", left: "0.03" };
      expect(waitingMessage(planStop("plan.cost", reserve))?.line).toBe(
        "It needs up to 8% of your monthly usage and you have less than 1% left. It resets on 2 December.",
      );
    });
  });

  describe("C3's other run messages", () => {
    it("says a run stopped for good once its wait ran out", () => {
      const run = planRunOf(
        runAtLimit("r51", planStop(), {
          status: "failed",
          reason: "budget",
          cause: planStop(),
          endedAt: "2026-11-17T10:40:00.000Z",
        }),
      );
      expect(run === undefined ? undefined : planLimitMessage(run)).toEqual({
        chip: "Failed",
        title: "This run stopped for good",
        line: "It waited 7 days at your plan's limit. Its results so far are kept.",
      });
    });

    it("says how many run at once, and that a run with no plan didn't start", () => {
      const concurrency = { running: "2", limit: "2", cap: "scope" };
      expect(
        stoppedMessage({ kind: "limit_reached", code: "plan.concurrency", detail: concurrency }),
      ).toEqual({
        chip: "Not started",
        title: "You have 2 runs going, the most your plan allows at once",
        line: "Start this one when one of them finishes.",
      });
      expect(stoppedMessage({ kind: "limit_reached", code: "plan.none" })).toEqual({
        chip: "Not started",
        title: "You don't have a plan right now",
        line: "You need a plan to start runs.",
      });
    });

    it("has no message for a paused account or the seller's own limits", () => {
      expect(stoppedMessage({ kind: "limit_reached", code: "plan.suspended" })).toBeUndefined();
      expect(planStopOf({ kind: "limit_reached", code: "budget.month" })).toBeUndefined();
    });
  });
});
