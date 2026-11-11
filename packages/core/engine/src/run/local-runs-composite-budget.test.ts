import type { Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { Budget } from "../budget/budget.ts";
import { addPricedCall, putSpentRun } from "../budget/budget-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { parentEndedError } from "./child-runs.ts";
import { runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** A workflow whose `work` state is `state`, after a `draft` task state when `drafted`. */
function around(id: string, state: WorkflowState, drafted = false): Workflow {
  const work = { ...state, on: [{ to: "done", event: "done" }] };
  return {
    version: 1,
    id,
    name: `Run ${id}`,
    initial: drafted ? "draft" : "work",
    context: {},
    states: {
      ...(drafted
        ? {
            draft: {
              type: "task",
              agent: "writer",
              input: "Draft",
              output: "draft",
              on: [{ to: "work", event: "done" }],
            } as WorkflowState,
          }
        : {}),
      work,
      done: { type: "final", on: [] },
    },
    layout: {},
  };
}

const parallel: WorkflowState = {
  type: "parallel",
  branches: {
    tone: { agent: "reader", input: "Check the tone" },
    facts: { agent: "reader", input: "Check the facts" },
  },
  on: [],
};

/** Labels three emails, two at a time, with an agent or with a child run each. */
function foreach(work: { agent: string } | { workflow: string }): WorkflowState {
  return {
    type: "foreach",
    ...work,
    items: "{{input.emails}}",
    as: "email",
    concurrency: 2,
    ...("agent" in work ? { input: "Label {{email}}" } : {}),
    output: "labels",
    on: [],
  };
}

/** The writer drafts a reply, then polishes it: two model calls. */
const draftTwice: Workflow = {
  ...replyWorkflow,
  id: "draft-twice",
  states: {
    ...replyWorkflow.states,
    draft: { ...replyWorkflow.states["draft"], on: [{ to: "polish", event: "done" }] },
    polish: {
      type: "task",
      agent: "writer",
      input: "Polish {{context.reply}}",
      output: "reply",
      on: [{ to: "sent", event: "done" }],
    },
  } as Workflow["states"],
};

const perRun: Budget = { currency: "EUR", perRun: 0.5 };
const monthly: Budget = { currency: "EUR", monthly: 0.5 };
const emails = { emails: ["Refund", "Invoice", "Hello"] };
const answers = ["a", "b", "c", "d", "e", "f"].map((text) => textAnswer(text));

function budgetRuns(workflow: Workflow, budget: Budget) {
  return runsOn(answers, new KernelRuns(), {
    workflow,
    workflows: { "draft-twice": draftTwice },
    budget,
  });
}

verifies("engine.budget-composite-stops", () => {
  it("stops a parallel state before any branch's call once the month's budget is reached", async () => {
    const { executor, model, runs, scheduler } = budgetRuns(around("check", parallel), monthly);
    putSpentRun(runs, "run_0", { startedAt: "2026-01-02T08:00:00.000Z", cost: 0.6 });

    const run = await executor.start({ hubId: "acme", workflowId: "check", input: {} });

    expect(run).toMatchObject({
      status: "failed",
      state: "work",
      reason: "budget",
      error: "Monthly budget reached: 0.60 of 0.50 EUR spent this month.",
    });
    expect(typesOf(runs.logs.get("run_1"))).toEqual([
      "run.started",
      "state.entered",
      "agent.started",
      "agent.started",
      "run.failed",
    ]);
    expect(model.requests).toHaveLength(0);
    expect(scheduler.timers.size).toBe(0);
  });

  it("stops a parallel state as it starts once an earlier state reached the run budget", async () => {
    const { executor, model, runs, scheduler } = budgetRuns(
      around("check", parallel, true),
      perRun,
    );
    await executor.start({ hubId: "acme", workflowId: "check", input: {} });
    addPricedCall(runs, "run_1", 0.6);

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "work",
      reason: "budget",
      error: "Run budget reached: 0.60 of 0.50 EUR spent.",
    });
    expect(model.requests).toHaveLength(1);
  });

  it("stops a for-each state before its next item, and makes no call of the others", async () => {
    const { executor, model, runs, scheduler } = budgetRuns(
      around("triage", foreach({ agent: "labeler" })),
      perRun,
    );
    await executor.start({ hubId: "acme", workflowId: "triage", input: emails });
    addPricedCall(runs, "run_1", 0.6);

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "work",
      reason: "budget",
      error: "Run budget reached: 0.60 of 0.50 EUR spent.",
    });
    // Item 0's answer would start item 2; the budget stops the run first,
    // so item 1's call, still to be made, is never made.
    expect(model.requests).toHaveLength(1);
    expect(typesOf(runs.logs.get("run_1")).slice(-3)).toEqual([
      "agent.finished",
      "agent.started",
      "run.failed",
    ]);
  });

  it("stops a for-each state, and cancels the other items' child runs, when one item's child reaches the run budget", async () => {
    const { executor, runs, scheduler } = budgetRuns(
      around("triage", foreach({ workflow: "draft-twice" })),
      perRun,
    );
    await executor.start({ hubId: "acme", workflowId: "triage", input: emails });
    addPricedCall(runs, "run_1.2.0", 0.6);

    await scheduler.runDue();

    const stop = "Run budget reached: 0.60 of 0.50 EUR spent.";
    // The other item's child is cancelled with the run, before its next call.
    expect(await runs.get("run_1.2.0")).toMatchObject({ reason: "budget", error: stop });
    expect(await runs.get("run_1.2.1")).toMatchObject({
      reason: "cancelled",
      error: parentEndedError,
    });
    expect(await runs.get("run_1.2.2")).toBeNull();
    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "work",
      reason: "budget",
    });
  });

  it("wraps an item's budget stop as any failure of an item's child run", async () => {
    const { executor, runs } = budgetRuns(
      around("triage", foreach({ workflow: "draft-twice" })),
      monthly,
    );
    putSpentRun(runs, "run_0", { startedAt: "2026-01-02T08:00:00.000Z", cost: 0.6 });

    await executor.start({ hubId: "acme", workflowId: "triage", input: emails });

    expect(await runs.get("run_1")).toMatchObject({
      reason: "budget",
      error:
        'Workflow "draft-twice" failed in item 0 of for-each state "work": ' +
        "Monthly budget reached: 0.60 of 0.50 EUR spent this month.",
    });
  });
});
