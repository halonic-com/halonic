import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import type { RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import { putSpentRun } from "./budget-test-kit.test-helper.ts";
import { spendOf } from "./spend.ts";

const at = "2026-01-20T10:00:00.000Z";

async function stateOf(runs: KernelRuns, runId: string): Promise<RunState> {
  const run = await readRun(runs, runId);
  if (run === null) throw new Error(`Run "${runId}" has no log.`);
  return run;
}

verifies("engine.budget-stops", () => {
  it("counts the whole run, from its top-level run down", async () => {
    const runs = new KernelRuns();
    putSpentRun(runs, "run_1", { startedAt: at, cost: 0.25 });
    const parent = { runId: "run_1", state: "check", depth: 1 };
    putSpentRun(runs, "run_1.2", { startedAt: at, cost: 0.25, parent });
    const grandparent = { runId: "run_1.2", state: "check", depth: 2 };
    putSpentRun(runs, "run_1.2.2", { startedAt: at, cost: 0.125, parent: grandparent });
    putSpentRun(runs, "run_2", { startedAt: at, cost: 4 });

    const spend = await spendOf(runs, await stateOf(runs, "run_1.2.2"), at);

    expect(spend).toEqual({ run: 0.625, month: 4.625 });
  });

  it("counts only this month's runs, and never a call the person's subscription paid", async () => {
    const runs = new KernelRuns();
    putSpentRun(runs, "run_1", { startedAt: "2025-12-31T23:59:59.000Z", cost: 3 });
    putSpentRun(runs, "run_2", {
      startedAt: "2026-01-02T08:00:00.000Z",
      cost: 2,
      paidBy: "subscription",
    });
    putSpentRun(runs, "run_3", { startedAt: "2026-01-03T08:00:00.000Z", cost: 0.5 });

    const spend = await spendOf(runs, await stateOf(runs, "run_3"), at);

    expect(spend).toEqual({ run: 0.5, month: 0.5 });
  });
});
