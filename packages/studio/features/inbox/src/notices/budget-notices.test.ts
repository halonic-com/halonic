import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { budgetNotices, monthBudgetUse, monthBudgetUsedUp } from "./budget-notices.ts";
import type { FailedRunNotice } from "./failed-run-notices.ts";
import { newestFirst } from "./merge-notices.ts";

const now = new Date("2026-11-16T12:00:00.000Z");
const monthly = { limit: 50, currency: "EUR" };
const workflowName = () => "Support replies";

function budgetRun(id: string, fields: Parameters<typeof waitingRun>[1] = {}) {
  return waitingRun(id, {
    status: "failed",
    state: null,
    startedAt: "2026-11-16T09:50:00.000Z",
    endedAt: "2026-11-16T10:00:00.000Z",
    reason: "budget",
    error: "Run budget reached: 5.08 of 5.00 EUR spent.",
    ...fields,
  });
}

verifies("inbox.budget-notices", () => {
  it("says a run stopped at its run budget, with the limit and spend the run's error gave", () => {
    const [notice, ...others] = budgetNotices([budgetRun("r1")], {
      monthly: undefined,
      workflowName,
      now,
    });
    expect(others).toEqual([]);
    expect(notice).toMatchObject({
      kind: "budget-run",
      runId: "r1",
      hubId: "acme",
      title:
        "Support replies stopped at its estimated budget · Reached €5.00 per run (estimated €5.08) · 2 hours ago",
    });
  });

  it("says a tiny run budget as less than, never as under", () => {
    const tiny = budgetRun("r1", { error: "Run budget reached: 0.0004 of 0.0003 EUR spent." });
    const [notice] = budgetNotices([tiny], { monthly: undefined, workflowName, now });
    expect(notice?.title).toBe(
      "Support replies stopped at its estimated budget · Reached its budget of less than €0.001 per run (estimated less than €0.001) · 2 hours ago",
    );
  });

  it("makes no row for a child run, last month's run, a test run or a monthly stop", () => {
    const runs = [
      budgetRun("child", { parentRunId: "r1" }),
      budgetRun("old", { endedAt: "2026-10-30T10:00:00.000Z" }),
      budgetRun("test", { kind: "test" }),
      budgetRun("month", { error: "Monthly budget reached: 50.10 of 50.00 EUR spent this month." }),
    ];
    expect(budgetNotices(runs, { monthly: undefined, workflowName, now })).toEqual([]);
  });

  it("says the month's budget is used up, and when runs can start again", () => {
    const spent = waitingRun("r2", { status: "completed", cost: 50.02, endedAt: null });
    const [notice, ...others] = budgetNotices([spent], { monthly, workflowName, now });
    expect(others).toEqual([]);
    expect(notice).toMatchObject({
      kind: "budget-month",
      key: "budget-month:2026-11:50",
      title:
        "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget.",
    });
  });

  it("says a tiny monthly budget as less than, never as under", () => {
    const tinyMonthly = { limit: 0.0004, currency: "EUR" };
    const spent = waitingRun("r2", { status: "completed", cost: 0.0005, endedAt: null });
    const [notice] = budgetNotices([spent], { monthly: tinyMonthly, workflowName, now });
    expect(notice).toMatchObject({
      title: expect.stringContaining("reached its budget of less than €0.001. Runs won't start"),
    });
  });

  it("says nothing below the budget, for last month's spend or for test runs", () => {
    const runs = [
      waitingRun("a", { cost: 49.99 }),
      waitingRun("b", { cost: 60, startedAt: "2026-10-31T23:59:00.000Z" }),
      waitingRun("c", { cost: 60, kind: "test" }),
    ];
    expect(budgetNotices(runs, { monthly, workflowName, now })).toEqual([]);
  });

  it("counts a spend exactly at the budget as used up, as the engine does", () => {
    expect(monthBudgetUsedUp(monthBudgetUse([waitingRun("a", { cost: 50 })], monthly, now))).toBe(
      true,
    );
    expect(monthBudgetUsedUp(monthBudgetUse([], undefined, now))).toBe(false);
  });

  it("says December after the 1 December rollover, and January in December", () => {
    const december = new Date("2026-12-10T12:00:00.000Z");
    const spent = waitingRun("r2", { cost: 60, startedAt: "2026-12-02T10:00:00.000Z" });
    const [notice] = budgetNotices([spent], { monthly, workflowName, now: december });
    expect(notice?.title).toContain("until 1 January (UTC)");
  });

  it("lists the rows newest first", () => {
    const spent = waitingRun("r2", { cost: 50.02, startedAt: "2026-11-16T11:00:00.000Z" });
    const kinds = budgetNotices([budgetRun("r1"), spent], { monthly, workflowName, now }).map(
      (notice) => notice.kind,
    );
    expect(kinds).toEqual(["budget-month", "budget-run"]);
  });

  it("takes the amounts from the run's typed cause, not its error", () => {
    const typed = budgetRun("r1", {
      error: "Something the engine said",
      cause: {
        kind: "limit_reached",
        code: "budget.run",
        detail: { limit: "0.01", spent: "0.36", currency: "EUR" },
      },
    });
    const [notice] = budgetNotices([typed], { monthly: undefined, workflowName, now });
    expect(notice?.title).toBe(
      "Support replies stopped at its estimated budget · Reached €0.01 per run (estimated €0.36) · 2 hours ago",
    );
  });

  it("reads the error of a run logged before the cause", () => {
    const [notice] = budgetNotices([budgetRun("r1")], { monthly: undefined, workflowName, now });
    expect(notice?.title).toContain("· Reached €5.00 per run (estimated €5.08) ·");
  });

  it("names no amount when neither the cause nor the error says it", () => {
    const runs = [
      budgetRun("r1", { error: "Something else" }),
      budgetRun("r2", { cause: { kind: "limit_reached", code: "budget.run" } }),
    ];
    const titles = budgetNotices(runs, { monthly: undefined, workflowName, now }).map(
      (notice) => notice.title,
    );
    expect(titles).toEqual([
      "Support replies stopped at its estimated budget · 2 hours ago",
      "Support replies stopped at its estimated budget · 2 hours ago",
    ]);
  });

  it("makes no row for a run whose cause is the monthly budget", () => {
    const month = budgetRun("r1", {
      cause: {
        kind: "limit_reached",
        code: "budget.month",
        detail: { limit: "50", spent: "50.10", currency: "EUR" },
      },
    });
    expect(budgetNotices([month], { monthly: undefined, workflowName, now })).toEqual([]);
  });

  it("puts the month's row first, above a newer failed run", () => {
    const spent = waitingRun("r2", { cost: 50.02, startedAt: "2026-11-16T08:00:00.000Z" });
    const [month] = budgetNotices([spent], { monthly, workflowName, now });
    const failed: FailedRunNotice = {
      kind: "failed-run",
      key: "failed-run:acme/daily:2026-11-16",
      routineId: "acme/daily",
      runId: "r9",
      hubId: "acme",
      at: "2026-11-16T11:30:00.000Z",
      count: 1,
      fixed: false,
      title: "Daily summary failed at 11:30",
    };
    if (month === undefined) throw new Error("no month row");
    expect([failed, month].sort(newestFirst).map((notice) => notice.kind)).toEqual([
      "budget-month",
      "failed-run",
    ]);
  });
});
