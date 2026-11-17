import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { budgetNotices, monthBudgetUse, monthBudgetUsedUp } from "./budget-notices.ts";

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
});
