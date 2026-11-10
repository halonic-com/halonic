import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { Budget } from "../budget/budget.ts";
import {
  addPricedCall,
  putSpentRun,
  type SpentRun,
} from "../budget/budget-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** The writer drafts a reply, then drafts it again: two model calls. */
const draftTwice: Workflow = {
  ...replyWorkflow,
  id: "draft-twice",
  states: {
    ...replyWorkflow.states,
    draft: {
      type: "task",
      agent: "writer",
      input: "Reply to {{input.from}}",
      output: "reply",
      on: [{ to: "polish", event: "done" }],
    },
    polish: {
      type: "task",
      agent: "writer",
      input: "Polish {{context.reply}}",
      output: "reply",
      on: [{ to: "sent", event: "done" }],
    },
  },
};

/** A workflow whose first state runs `child`, then ends. */
function runsChild(id: string, child: string): Workflow {
  return {
    version: 1,
    id,
    name: `Run ${child}`,
    initial: "check",
    context: {},
    states: {
      check: { type: "workflow", workflow: child, on: [{ to: "done", event: "done" }] },
      done: { type: "final", on: [] },
    },
    layout: {},
  };
}

const onboard = runsChild("onboard", "reply");
const workflows = { reply: replyWorkflow, "draft-twice": draftTwice, onboard };
const answers = [textAnswer("Dear support"), textAnswer("Dear support, thanks")];

/** An executor with `budget`, and an earlier run that spent as `earlier` says. */
function budgetRuns(workflow: Workflow, budget: Budget, earlier?: SpentRun) {
  const runs = new KernelRuns();
  if (earlier !== undefined) putSpentRun(runs, "run_0", earlier);
  return runsOn(answers, runs, { workflow, workflows, budget });
}

const monthly = { currency: "EUR", monthly: 0.5 };
const perRun = { currency: "EUR", perRun: 0.5 };
const thisMonth = "2026-01-02T08:00:00.000Z";

verifies("engine.budget-stops", () => {
  it("stops a run before its model call once the month's budget is reached", async () => {
    const { executor, model, runs, scheduler } = budgetRuns(replyWorkflow, monthly, {
      startedAt: thisMonth,
      cost: 0.6,
    });

    const run = await executor.start({ hubId: "acme", workflowId: "reply", input: {} });

    expect(run).toMatchObject({
      status: "failed",
      state: "draft",
      reason: "budget",
      error: "Monthly budget reached: 0.60 of 0.50 EUR spent this month.",
    });
    expect(typesOf(runs.logs.get("run_1"))).toEqual([
      "run.started",
      "state.entered",
      "agent.started",
      "run.failed",
    ]);
    expect(model.requests).toHaveLength(0);
    expect(scheduler.timers.size).toBe(0);
  });

  it("counts neither last month's runs nor calls the person's subscription paid", async () => {
    for (const earlier of [
      { startedAt: "2025-12-31T23:00:00.000Z", cost: 0.6 },
      { startedAt: thisMonth, cost: 0.6, paidBy: "subscription" as const },
    ]) {
      const { executor, runs, scheduler } = budgetRuns(replyWorkflow, monthly, earlier);
      await executor.start({ hubId: "acme", workflowId: "reply", input: {} });
      await scheduler.runDue();

      expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    }
  });

  it("stops a run at its next model call once its own calls reach the run budget", async () => {
    const { executor, model, runs, scheduler } = budgetRuns(draftTwice, perRun);
    await executor.start({ hubId: "acme", workflowId: "draft-twice", input: {} });
    addPricedCall(runs, "run_1", 0.6);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "polish",
      reason: "budget",
      error: "Run budget reached: 0.60 of 0.50 EUR spent.",
    });
    expect(model.requests).toHaveLength(1);
  });

  it("stops a sub-workflow, and its parent, for the run budget", async () => {
    const parent = runsChild("check-draft", "draft-twice");
    const { executor, runs, scheduler } = budgetRuns(parent, perRun);
    await executor.start({ hubId: "acme", workflowId: "check-draft", input: {} });
    addPricedCall(runs, "run_1.2", 0.6);
    await scheduler.runDue();

    expect(await runs.get("run_1.2")).toMatchObject({ status: "failed", reason: "budget" });
    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      reason: "budget",
      error: 'Workflow "draft-twice" failed: Run budget reached: 0.60 of 0.50 EUR spent.',
    });
  });

  it("keeps the reason error for a child that failed for anything else", async () => {
    const parent = runsChild("check-draft", "reply");
    const { executor, runs, scheduler } = runsOn([new Error("socket hang up")], new KernelRuns(), {
      workflow: parent,
      workflows,
      budget: perRun,
    });
    await executor.start({ hubId: "acme", workflowId: "check-draft", input: {} });
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "failed", reason: "error" });
  });
});

verifies("engine.budget-stop-message", () => {
  it("wraps a child's budget stop once for each level above it", async () => {
    const welcome = runsChild("welcome", "onboard");
    const { executor, runs } = budgetRuns(welcome, monthly, { startedAt: thisMonth, cost: 0.6 });

    await executor.start({ hubId: "acme", workflowId: "welcome", input: {} });

    const stop = "Monthly budget reached: 0.60 of 0.50 EUR spent this month.";
    expect(await runs.get("run_1.2.2")).toMatchObject({ reason: "budget", error: stop });
    expect(await runs.get("run_1.2")).toMatchObject({
      reason: "budget",
      error: `Workflow "reply" failed: ${stop}`,
    });
    expect(await runs.get("run_1")).toMatchObject({
      reason: "budget",
      error: `Workflow "onboard" failed: Workflow "reply" failed: ${stop}`,
    });
  });
});
