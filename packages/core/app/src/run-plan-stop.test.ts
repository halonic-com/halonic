import {
  type RunEvent,
  type RunEventBody,
  type RunFailureCause,
  summarize,
} from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { planRunOf, planStopOf } from "./run-plan-stop.ts";

/** A `limit_reached` cause with `code` and `detail`. */
function limit(code: string, detail?: Record<string, string>): RunFailureCause {
  return { kind: "limit_reached", code, ...(detail === undefined ? {} : { detail }) };
}

/** Acme Support's reply run, started on 26 November, then `bodies` with their times. */
function summaryOf(...bodies: [string, RunEventBody][]) {
  const started: [string, RunEventBody] = [
    "2026-11-26T09:00:00.000Z",
    {
      type: "run.started",
      hubId: "acme",
      workflowId: "support-reply",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
    },
  ];
  const events = [started, ...bodies].map(
    ([at, body], index): RunEvent => ({ runId: "r", seq: index + 1, at, ...body }),
  );
  const summary = summarize(events);
  if (summary === null) throw new Error("expected a summary");
  return summary;
}

const costStop = limit("plan.cost", {
  unit: "cost",
  used: "10.2",
  limit: "10",
  currency: "EUR",
  resetsAt: "2026-12-01T00:00:00.000Z",
  canUpgrade: "false",
});
const waitEnds = "2026-12-03T09:00:00.000Z";

/** The `run.limit-waiting` at `costStop`, until `waitEnds`. */
const waiting: RunEventBody = {
  type: "run.limit-waiting",
  state: "draft",
  error: "Plan limit reached: 10.2 of 10 EUR used.",
  cause: costStop,
  until: waitEnds,
  input: {},
};

/** A `run.failed` with the reason `budget` at `cause`. */
function failedAt(cause: RunFailureCause): RunEventBody {
  return { type: "run.failed", state: "draft", error: "Stopped.", reason: "budget", cause };
}

verifies("app.run-plan-stop", () => {
  describe("the stop's facts", () => {
    it("reads a unit's stop with its amounts, reset and plan", () => {
      const cause = limit("plan.harnessMinutes", {
        unit: "harnessMinutes",
        used: "130",
        limit: "120",
        resetsAt: "2026-12-01T00:00:00.000Z",
        planId: "pro",
        planVersion: "3",
        planName: "Pro",
        canUpgrade: "false",
      });
      expect(planStopOf(cause)).toEqual({
        kind: "unit",
        unit: "harnessMinutes",
        member: false,
        usedPercent: 100,
        used: 130,
        limit: 120,
        resetsAt: "2026-12-01T00:00:00.000Z",
        planName: "Pro",
        canUpgrade: false,
      });
    });

    it("gives the cost unit as a percentage only, never money", () => {
      const cause = limit("plan.cost", {
        unit: "cost",
        used: "6.2",
        limit: "10",
        currency: "EUR",
        canUpgrade: "true",
      });
      const stop = planStopOf(cause);
      expect(stop).toEqual({
        kind: "unit",
        unit: "cost",
        member: false,
        usedPercent: 62,
        canUpgrade: true,
      });
      expect(JSON.stringify(stop)).not.toMatch(/6\.2|EUR/);
    });

    it("reads a refused reservation as the percent needed, rounded up, and left, rounded down", () => {
      const cause = limit("plan.cost", {
        unit: "cost",
        used: "9.7",
        limit: "10",
        currency: "EUR",
        canUpgrade: "false",
        phase: "reserve",
        needed: "0.75",
        left: "0.3",
      });
      expect(planStopOf(cause)).toMatchObject({
        usedPercent: 97,
        reserve: { neededPercent: 8, leftPercent: 3 },
      });
      expect(JSON.stringify(planStopOf(cause))).not.toMatch(/0\.75|0\.3/);
    });

    it("keeps a refused reservation's amounts for a unit that isn't cost", () => {
      const cause = limit("plan.harnessMinutes", {
        unit: "harnessMinutes",
        used: "100",
        limit: "120",
        phase: "reserve",
        needed: "30",
        left: "20",
      });
      expect(planStopOf(cause)).toMatchObject({
        reserve: { neededPercent: 25, leftPercent: 16, needed: 30, left: 20 },
      });
    });

    it("says no bigger plan helps a member's share, whatever the stop says", () => {
      const cause = limit("plan.member.cost", {
        unit: "cost",
        used: "5",
        limit: "5",
        canUpgrade: "true",
      });
      expect(planStopOf(cause)).toMatchObject({ member: true, canUpgrade: false });
    });

    it("reads too many runs at once", () => {
      const cause = limit("plan.concurrency", { running: "2", limit: "2", cap: "scope" });
      expect(planStopOf(cause)).toEqual({
        kind: "concurrency",
        running: 2,
        limit: 2,
        cap: "scope",
      });
    });

    it("reads the stops without detail", () => {
      expect(planStopOf(limit("plan.none"))).toEqual({ kind: "none" });
      expect(planStopOf(limit("plan.suspended"))).toEqual({ kind: "suspended" });
      expect(planStopOf(limit("plan.member-removed"))).toEqual({ kind: "member-removed" });
    });

    it("gives no facts for another cause, or a detail missing a figure", () => {
      const none = [
        undefined,
        limit("plan.cost"),
        limit("plan.cost", { unit: "cost", used: "five", limit: "10" }),
        limit("plan.cost", { unit: "harnessMinutes", used: "1", limit: "10" }),
        limit("plan.concurrency", { running: "2", limit: "2", cap: "everyone" }),
        limit("plan.inactive"),
        limit("budget.month", { limit: "50", spent: "50.1", currency: "EUR" }),
        { kind: "unavailable", code: "plan.none" } satisfies RunFailureCause,
      ];
      for (const cause of none) {
        expect(planStopOf(cause), JSON.stringify(cause)).toBeUndefined();
      }
    });
  });

  describe("where the run stands", () => {
    it("is waiting at a unit's limit, until its wait ends", () => {
      const summary = summaryOf(["2026-11-26T09:00:01.000Z", waiting]);
      expect(planRunOf(summary)).toMatchObject({ state: "waiting", until: waitEnds });
    });

    it("stopped for good when it failed at the end of its wait", () => {
      const summary = summaryOf(
        ["2026-11-26T09:00:01.000Z", waiting],
        [waitEnds, failedAt(costStop)],
      );
      expect(planRunOf(summary)).toMatchObject({ state: "stopped-for-good" });
    });

    it("stopped, not for good, when it was continued and then failed at a stop", () => {
      const summary = summaryOf(
        ["2026-11-26T09:00:01.000Z", waiting],
        ["2026-11-27T09:00:00.000Z", { type: "event.received", event: "continue" }],
        [waitEnds, failedAt(costStop)],
      );
      expect(planRunOf(summary)).toMatchObject({ state: "stopped" });
    });

    it("stopped at a plan stop without waiting", () => {
      const noPlan = summaryOf(["2026-11-26T09:00:01.000Z", failedAt(limit("plan.none"))]);
      expect(planRunOf(noPlan)).toEqual({ state: "stopped", stop: { kind: "none" } });
      const cost = summaryOf(["2026-11-26T09:00:01.000Z", failedAt(costStop)]);
      expect(planRunOf(cost)).toMatchObject({ state: "stopped", stop: { unit: "cost" } });
    });

    it("gives nothing for a run at the workspace's own budget, or still running", () => {
      const budget = limit("budget.month", { limit: "50", spent: "50.1", currency: "EUR" });
      expect(planRunOf(summaryOf(["2026-11-26T09:00:01.000Z", failedAt(budget)]))).toBeUndefined();
      expect(planRunOf(summaryOf())).toBeUndefined();
    });
  });
});
