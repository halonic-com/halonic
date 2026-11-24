import { treeUsage } from "@halonicjs/app";
import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { allTokensOf, budgetStopOf, runTokenLimitReached } from "../budget/budget.ts";
import { addPricedCall } from "../budget/budget-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import { textAnswer } from "../testing/scripted-model.ts";
import { runsOn } from "./local-runs-test-kit.test-helper.ts";

/** The writer drafts a reply, then polishes it: two model calls. */
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

/** A summary with only the fields the token count reads. */
function tokenRun(id: string, parentRunId: string | null, usage: { cacheReadTokens?: number }) {
  return { id, parentRunId, usage: { inputTokens: 100, outputTokens: 20, ...usage } };
}

/** The tokens of a run that used `count` output tokens. */
function tokensUsed(count: number) {
  return { run: { inputTokens: 0, outputTokens: count } };
}

verifies("engine.budget-token-stops", () => {
  it("counts every token of the run and its child runs, cache reads and writes included", () => {
    const summaries = [
      {
        id: "top",
        parentRunId: null,
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadTokens: 1000,
          cacheWriteTokens: 50,
          cacheWrite1hTokens: 5,
        },
      },
      tokenRun("child", "top", {}),
      tokenRun("other", null, { cacheReadTokens: 9000 }),
    ];

    expect(allTokensOf(treeUsage(summaries, "top"))).toBe(1295);
  });

  it("stops a run whose cache reads alone take it over the limit", () => {
    const budget = { currency: "EUR", perRunTokens: 1000 };
    const run = treeUsage([tokenRun("top", null, { cacheReadTokens: 900 })], "top");

    expect(budgetStopOf(budget, { run: 0, month: 0, tokens: { run } })).toEqual({
      error: "Run token limit reached: 1,020 of 1,000 tokens used.",
      cause: {
        kind: "limit_reached",
        code: "budget.run-tokens",
        detail: { limit: "1000", spent: "1020" },
      },
    });
    expect(budgetStopOf(budget, { run: 0, month: 0, tokens: tokensUsed(999) })).toBeNull();
  });

  it("checks the run budget first, then the token limit, then the monthly budget", () => {
    const budget = { currency: "EUR", perRun: 1, perRunTokens: 10, monthly: 5 };

    expect(budgetStopOf(budget, { run: 1, month: 5, tokens: tokensUsed(10) })?.cause.code).toBe(
      "budget.run",
    );
    expect(budgetStopOf(budget, { run: 0, month: 5, tokens: tokensUsed(10) })?.cause.code).toBe(
      "budget.run-tokens",
    );
    expect(runTokenLimitReached(1_000_000, 1_204_331)).toBe(
      "Run token limit reached: 1,204,331 of 1,000,000 tokens used.",
    );
  });

  it("stops a run at its next model call once its own calls reach the token limit", async () => {
    const answers = [textAnswer("Dear support"), textAnswer("Dear support, thanks")];
    const { executor, model, runs, scheduler } = runsOn(answers, new KernelRuns(), {
      workflow: draftTwice,
      workflows: { "draft-twice": draftTwice },
      budget: { currency: "EUR", perRunTokens: 1000 },
    });
    await executor.start({ hubId: "acme", workflowId: "draft-twice", input: { from: "ada" } });
    // A call that cost nothing, as a subscription's does, still counts its 1,200 tokens.
    addPricedCall(runs, "run_1", 0);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "failed",
      state: "polish",
      reason: "budget",
      error: "Run token limit reached: 1,215 of 1,000 tokens used.",
      cause: { code: "budget.run-tokens", detail: { limit: "1000", spent: "1215" } },
    });
    expect(model.requests).toHaveLength(1);
  });
});
