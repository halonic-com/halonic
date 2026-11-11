import { isRunFailureError } from "@halonicjs/ports";
import { errorKindOf, KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { BudgetReachedError, type CallBudget } from "../budget/call-budget.ts";
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
      throw new KindedError("limit_reached", "Run budget reached: 1.00 of 1.00 EUR spent.");
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
});
