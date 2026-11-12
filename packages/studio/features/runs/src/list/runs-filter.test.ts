import type { RunSummary } from "@halonicjs/events";
import { describe, expect, it } from "vitest";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { runRow } from "./run-row.ts";
import { dayGroups, emptyList, filterRuns, startFilters, statusCounts } from "./runs-filter.ts";

function rowOf(id: string, changes: Partial<RunSummary>) {
  const workflow = { name: "Support reply", stepDescription: () => undefined };
  return runRow(
    { summary: summaryWith({ id, ...changes }), madeToolCalls: false },
    { workflow, routine: undefined, currency: "EUR", now: mondayMorning },
  );
}

const running = rowOf("running", {});
const needsYou = rowOf("needs", { approvals: [approvalAt(1)] });
const timer = rowOf("timer", { status: "waiting", nextTimer: minutesLater(60) });
const done = rowOf("done", { status: "completed" });
const failed = rowOf("failed", { status: "failed" });
const budget = rowOf("budget", { status: "failed", reason: "budget" });
const cancelled = rowOf("cancelled", { status: "failed", reason: "cancelled" });
const finishedTest = rowOf("test-done", { kind: "test", status: "completed" });
const waitingTest = rowOf("test-needs", { kind: "test", approvals: [approvalAt(1)] });
const all = [running, needsYou, timer, done, failed, budget, cancelled, finishedTest, waitingTest];
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe("filterRuns", () => {
  it("shows every run but a finished test run at first", () => {
    expect(ids(filterRuns(all, startFilters))).toEqual(ids(all).filter((id) => id !== "test-done"));
    expect(ids(filterRuns(all, { ...startFilters, testRuns: true }))).toEqual(ids(all));
  });

  it("takes running and waiting runs as live", () => {
    expect(ids(filterRuns(all, { ...startFilters, status: "live" }))).toEqual([
      "running",
      "needs",
      "timer",
      "test-needs",
    ]);
  });

  it("takes every Stopped run as failed, as `halonic runs --status failed`", () => {
    expect(ids(filterRuns(all, { ...startFilters, status: "failed" }))).toEqual([
      "failed",
      "budget",
      "cancelled",
    ]);
  });

  it("counts live runs and runs that need you over what Test runs lets through", () => {
    expect(statusCounts(all, false)).toEqual({ live: 4, needsYou: 2 });
    expect(statusCounts([finishedTest], false)).toEqual({ live: 0, needsYou: 0 });
  });
});

describe("emptyList", () => {
  it("has nothing to say while there are rows", () => {
    expect(emptyList(all, startFilters)).toBeUndefined();
  });

  it("says there are no runs yet, and that only test runs are hidden", () => {
    expect(emptyList([], startFilters)).toEqual({ kind: "no-runs" });
    expect(emptyList([finishedTest], startFilters)).toEqual({
      kind: "only-test-runs",
      line: "Only test runs so far.",
    });
  });

  it("gives each status chip its own line", () => {
    expect(emptyList([done], { ...startFilters, status: "live" })).toEqual({
      kind: "status",
      line: "Nothing is running.",
    });
    expect(emptyList([done], { ...startFilters, status: "needs-you" })).toEqual({
      kind: "status",
      line: "Nothing is waiting for you.",
    });
    expect(emptyList([done], { ...startFilters, status: "failed" })).toEqual({
      kind: "status",
      line: "No failed runs.",
    });
  });
});

describe("dayGroups", () => {
  it("groups runs by the day they started: today, yesterday, then the date", () => {
    const at = (day: number) => new Date(2026, 10, day, 9, 0).toISOString();
    const rows = [
      rowOf("a", { startedAt: at(9) }),
      rowOf("b", { startedAt: at(9) }),
      rowOf("c", { startedAt: at(8) }),
      rowOf("d", { startedAt: at(6) }),
      rowOf("e", { startedAt: new Date(2025, 11, 30, 9, 0).toISOString() }),
    ];
    expect(dayGroups(rows, mondayMorning).map((group) => [group.day, ids(group.rows)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Fri 6 Nov", ["d"]],
      ["Tue 30 Dec 2025", ["e"]],
    ]);
  });
});
