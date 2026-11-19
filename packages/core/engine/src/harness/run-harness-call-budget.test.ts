import { isRunFailureError } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { BudgetReachedError, BudgetStopError, type CallBudget } from "../budget/call-budget.ts";
import { runCallOn, writerCall } from "./harness-call-test-kit.test-helper.ts";
import { harnessPorts, stillOpen } from "./harness-test-kit.test-helper.ts";

/** A budget that lets `calls` model calls go out, then refuses every one after them. */
function budgetOf(calls: number): CallBudget {
  let left = calls;
  return {
    keep: async () => {
      if (left > 0) {
        left -= 1;
        return;
      }
      throw new BudgetStopError({
        error: "Run budget reached: 1.00 of 1.00 EUR spent.",
        cause: {
          kind: "limit_reached",
          code: "budget.run",
          detail: { limit: "1", spent: "1", currency: "EUR" },
        },
      });
    },
  };
}

verifies("engine.budget-stops", () => {
  it("refuses the model call past the budget, writes no request for it, and stops everything", async () => {
    const ports = harnessPorts();
    ports.harness.events = [{ type: "tool.called", agent: "writer", tool: "Read", args: {} }];
    ports.harness.hangs = true;
    const request = {
      type: "llm.request",
      agent: "writer",
      provider: "anthropic",
      model: "m",
      messages: 1,
    } as const;
    const refused = Promise.withResolvers<unknown>();
    ports.harness.whileRunning = () => {
      const recorder = ports.recorders[0];
      void recorder
        ?.record(request)
        .then(() => recorder.record(request))
        .catch(refused.resolve);
    };

    const { error, written } = await runCallOn(ports, undefined, undefined, undefined, {
      ...writerCall,
      budget: budgetOf(1),
    });

    expect(error).toBeInstanceOf(BudgetReachedError);
    expect((error as BudgetReachedError).failureCause).toMatchObject({
      kind: "limit_reached",
      code: "budget.run",
    });
    expect(errorKindOf(await refused.promise)).toBe("limit_reached");
    expect(written.map((event) => event.type).slice(-2)).toEqual(["llm.request", "tool.called"]);
    expect(ports.steps.slice(-3)).toEqual(["harness.cancel", "session.close", "bridge.close"]);
    expect(stillOpen(ports.steps)).toBe(0);
  });

  it("fails with the budget, not as a harness that didn't start, when it stops before the first event", async () => {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    ports.harness.whileRunning = () => {
      void ports.recorders[0]
        ?.record({
          type: "llm.request",
          agent: "writer",
          provider: "anthropic",
          model: "m",
          messages: 1,
        })
        .catch(() => {});
    };

    const { error } = await runCallOn(ports, undefined, undefined, undefined, {
      ...writerCall,
      budget: budgetOf(0),
    });

    expect(error).toBeInstanceOf(BudgetReachedError);
    expect(isRunFailureError(error)).toBe(false);
  });

  it("writes a bridge failure past the budget without asking it or stopping the call", async () => {
    const ports = harnessPorts();
    ports.harness.events = [{ type: "agent.finished", agent: "writer", output: "done" }];
    let asked = 0;
    const reached: CallBudget = {
      keep: async () => {
        asked += 1;
        await budgetOf(0).keep();
      },
    };
    const failed = {
      type: "bridge.failed",
      agent: "writer",
      kind: "internal",
      message: "the tool list could not be read",
    } as const;
    const recorded = Promise.withResolvers<unknown>();
    ports.harness.whileRunning = () => {
      void ports.recorders[0]?.record(failed).then(recorded.resolve, recorded.resolve);
    };

    const { error, written } = await runCallOn(ports, undefined, undefined, undefined, {
      ...writerCall,
      budget: reached,
    });

    expect(await recorded.promise).toBeUndefined();
    expect(error).toBeUndefined();
    expect(asked).toBe(0);
    expect(written).toContainEqual(failed);
  });
});
