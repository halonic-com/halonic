import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RunCost } from "../costs/cost-totals.ts";
import { type GroupedRun, runGroups, todaySummary, workflowRunPhase } from "./run-groups.ts";

const now = new Date("2026-11-25T10:00:00Z");
const timeZone = "Europe/Madrid";
const nobodyOpened = { opened: new Set<string>(), now, timeZone };

function euros(minorUnits: number): RunCost {
  return { kind: "money", currency: "EUR", minorUnits };
}

function run(id: string, overrides: Partial<GroupedRun> = {}): GroupedRun {
  return {
    id,
    phase: "succeeded",
    startedAt: "2026-11-25T08:00:00Z",
    lineage: "nightly-report",
    cost: euros(4),
    ...overrides,
  };
}

/** Each group's heading with its runs' ids, in order. */
function shape(groups: ReturnType<typeof runGroups>) {
  return groups.map((group) => [group.heading, group.runs.map((each) => each.id)]);
}

verifies("runs.run-groups", () => {
  describe("runGroups", () => {
    it("puts the most urgent first, each newest first, and leaves empty groups out", () => {
      const runs = [
        run("done-today", { startedAt: "2026-11-25T07:00:00Z" }),
        run("running-old", { phase: "running", startedAt: "2026-11-25T06:00:00Z" }),
        run("running-new", { phase: "running", startedAt: "2026-11-25T09:00:00Z" }),
        run("waiting", { phase: "needs-you", startedAt: "2026-11-24T09:00:00Z" }),
        run("failed", { phase: "failed", lineage: "weekly-digest" }),
      ];
      expect(shape(runGroups(runs, nobodyOpened))).toEqual([
        ["Needs you", ["waiting"]],
        ["Failed", ["failed"]],
        ["Running", ["running-new", "running-old"]],
        ["Earlier today", ["done-today"]],
      ]);
    });

    it("moves a failure to its day once opened", () => {
      const runs = [run("failed", { phase: "failed" })];
      expect(shape(runGroups(runs, { ...nobodyOpened, opened: new Set(["failed"]) }))).toEqual([
        ["Earlier today", ["failed"]],
      ]);
    });

    it("moves a failure to its day once a later run of the same workflow succeeds", () => {
      const runs = [
        run("failed", { phase: "failed", startedAt: "2026-11-25T07:00:00Z" }),
        run("fixed", { startedAt: "2026-11-25T08:00:00Z" }),
        run("other-failed", { phase: "failed", lineage: "weekly-digest" }),
      ];
      expect(shape(runGroups(runs, nobodyOpened))).toEqual([
        ["Failed", ["other-failed"]],
        ["Earlier today", ["fixed", "failed"]],
      ]);
    });

    it("keeps a failure in Failed when only an earlier run succeeded", () => {
      const runs = [
        run("failed", { phase: "failed", startedAt: "2026-11-25T08:00:00Z" }),
        run("before", { startedAt: "2026-11-25T07:00:00Z" }),
      ];
      expect(shape(runGroups(runs, nobodyOpened))[0]).toEqual(["Failed", ["failed"]]);
    });

    it("puts a stopped run under its day, never under Failed", () => {
      const runs = [run("stopped", { phase: workflowRunPhase("budget") })];
      expect(shape(runGroups(runs, nobodyOpened))).toEqual([["Earlier today", ["stopped"]]]);
    });

    it("heads days in the user's zone: Yesterday, then the date, with the year when it differs", () => {
      const runs = [
        // 23:30 in Madrid on 24 November, though 25 November had begun in UTC an hour later.
        run("late", { startedAt: "2026-11-24T22:30:00Z" }),
        run("older", { startedAt: "2026-11-06T10:00:00Z" }),
        run("last-year", { startedAt: "2025-12-31T10:00:00Z" }),
      ];
      expect(shape(runGroups(runs, nobodyOpened))).toEqual([
        ["Yesterday", ["late"]],
        ["Fri 6 Nov", ["older"]],
        ["Wed 31 Dec 2025", ["last-year"]],
      ]);
    });

    it("counts a run as today from local midnight, not UTC midnight", () => {
      // 00:30 on 25 November in Madrid is still 24 November in UTC.
      const runs = [run("early", { startedAt: "2026-11-24T23:30:00Z" })];
      expect(shape(runGroups(runs, nobodyOpened))).toEqual([["Earlier today", ["early"]]]);
    });
  });

  describe("workflowRunPhase", () => {
    it("maps each standing to the group it belongs in", () => {
      expect(
        (
          [
            "needs-you",
            "running",
            "waiting",
            "failed",
            "cant-try",
            "budget",
            "cancelled",
            "done",
          ] as const
        ).map(workflowRunPhase),
      ).toEqual([
        "needs-you",
        "running",
        "running",
        "failed",
        "failed",
        "stopped",
        "stopped",
        "succeeded",
      ]);
    });
  });

  describe("todaySummary", () => {
    it("counts today's runs and failures, and keeps each currency apart", () => {
      const runs = [
        run("a", { cost: euros(4) }),
        run("b", { phase: "failed", cost: euros(7) }),
        run("c", { phase: "running", cost: { kind: "money", currency: "USD", minorUnits: 10 } }),
        run("d", { cost: { kind: "tokens", tokens: 1200 } }),
        run("yesterday", { phase: "running", startedAt: "2026-11-24T10:00:00Z", cost: euros(50) }),
      ];
      expect(todaySummary(runs, { now, timeZone })).toEqual({
        runs: 4,
        failed: 1,
        money: [
          { currency: "EUR", minorUnits: 11 },
          { currency: "USD", minorUnits: 10 },
        ],
        running: 2,
      });
    });
  });
});
