import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import type { RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import { budgetStopOf } from "./budget.ts";
import { addPricedCall, callTokens, putSpentRun } from "./budget-test-kit.test-helper.ts";
import { spendOf } from "./spend.ts";

const at = "2026-01-20T10:00:00.000Z";

async function stateOf(runs: KernelRuns, runId: string): Promise<RunState> {
  const run = await readRun(runs, runId);
  if (run === null) throw new Error(`Run "${runId}" has no log.`);
  return run;
}

verifies("engine.budget-tokens", () => {
  it("counts the tokens of a run on an API key next to its cost", async () => {
    const runs = new KernelRuns();
    putSpentRun(runs, "run_1", { startedAt: at, cost: 0.25 });
    addPricedCall(runs, "run_1", 0.25);

    const spend = await spendOf(runs, await stateOf(runs, "run_1"), at);

    expect(spend).toEqual({
      run: 0.5,
      month: 0.5,
      tokens: { run: callTokens(2), month: callTokens(2) },
    });
  });

  it("counts the tokens of a run a subscription paid for, though it costs nothing", async () => {
    const runs = new KernelRuns();
    putSpentRun(runs, "run_1", { startedAt: at, cost: 0.25, paidBy: "subscription" });
    const parent = { runId: "run_1", state: "check", depth: 1 };
    putSpentRun(runs, "run_1.2", { startedAt: at, cost: 0.25, paidBy: "subscription", parent });

    const spend = await spendOf(runs, await stateOf(runs, "run_1.2"), at);

    expect(spend).toEqual({
      run: 0,
      month: 0,
      tokens: { run: callTokens(2), month: callTokens(2) },
    });
  });

  it("adds up the month's tokens over subscription and API-key runs, this month's only", async () => {
    const runs = new KernelRuns();
    putSpentRun(runs, "run_0", { startedAt: "2025-12-31T23:59:59.000Z", cost: 1 });
    putSpentRun(runs, "run_1", { startedAt: at, cost: 0.5, paidBy: "subscription" });
    putSpentRun(runs, "run_2", { startedAt: at, cost: 0.5 });
    putSpentRun(runs, "test_1", { startedAt: at, cost: 0.5, kind: "test" });

    const spend = await spendOf(runs, await stateOf(runs, "run_2"), at);

    expect(spend.month).toBe(0.5);
    expect(spend.tokens).toEqual({ run: callTokens(1), month: callTokens(2) });
  });

  it("stops no run on its tokens, however many it used", async () => {
    const runs = new KernelRuns();
    putSpentRun(runs, "run_1", { startedAt: at, cost: 0.25, paidBy: "subscription" });
    for (let call = 0; call < 50; call += 1) addPricedCall(runs, "run_1", 0);

    const spend = await spendOf(runs, await stateOf(runs, "run_1"), at);

    expect(spend.tokens.run).toEqual(callTokens(51));
    expect(budgetStopOf({ currency: "EUR", perRun: 0.01, monthly: 0.01 }, spend)).toBeNull();
  });
});
