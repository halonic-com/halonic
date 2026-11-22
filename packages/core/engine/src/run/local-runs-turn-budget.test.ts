import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

// Each scripted answer reads 10 tokens, so at this price each model call costs 0.30.
const price = { input: 30_000, output: 0 };

/** A writer whose turn calls a tool twice, then answers: three model calls in one step. */
const threeRounds = [
  callAnswer(call("c1", "lookup", {})),
  callAnswer(call("c2", "lookup", {})),
  textAnswer("Dear support"),
];

verifies("engine.turn-budget", () => {
  it("stops a run inside one agent turn once its calls reach the run budget", async () => {
    const runs = new KernelRuns();
    const { executor, model, scheduler } = runsOn(threeRounds, runs, {
      budget: { currency: "EUR", perRun: 0.5 },
      price,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests).toHaveLength(2);
    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "draft",
      reason: "budget",
      cause: { code: "budget.run" },
    });
  });

  it("doesn't start a subagent's turn once the delegating call reached the run budget", async () => {
    const runs = new KernelRuns();
    const checker = { ...writerAgent(), id: "checker", name: "checker" };
    const { executor, model, scheduler } = runsOn(
      [
        callAnswer(call("d-1", "delegate_checker", { task: "Check the reply to support" })),
        textAnswer("Looks right"),
        textAnswer("Dear support"),
      ],
      runs,
      {
        agents: { writer: { ...writerAgent(), subagents: ["checker"] }, checker },
        budget: { currency: "EUR", perRun: 0.25 },
        price,
      },
    );

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests).toHaveLength(1);
    expect(await runs.get("run_1")).toMatchObject({ status: "failed", reason: "budget" });
  });

  it("lets a turn ask its model as often as it needs while the budget holds", async () => {
    const runs = new KernelRuns();
    const { executor, model, scheduler } = runsOn(threeRounds, runs, {
      budget: { currency: "EUR", perRun: 5 },
      price,
    });

    await executor.start(replyStart);
    await scheduler.runDue();

    expect(model.requests).toHaveLength(3);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
