import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runBudgetReached } from "../budget/budget.ts";
import type { MeterAnswer } from "./meter.ts";
import { noPlanStop, suspendedStop } from "./plan-stops.ts";
import { stopOfAnswer } from "./read-answer.ts";

verifies("engine.meter-checks", () => {
  it("allows only on allowed: true, and keeps the meter's stop", () => {
    expect(stopOfAnswer({ allowed: true })).toBeNull();
    expect(stopOfAnswer({ allowed: false, stop: suspendedStop() })).toEqual(suspendedStop());
  });

  it("refuses with plan.none when the answer has no plan stop or isn't an answer", () => {
    const budgetStop = {
      error: runBudgetReached(1, 1, "EUR"),
      cause: { kind: "limit_reached", code: "budget.run" },
    };
    const answers = [
      { allowed: false },
      { allowed: "yes" },
      { allowed: false, stop: budgetStop },
      undefined,
    ] as unknown as (MeterAnswer | undefined)[];
    for (const answer of answers) {
      expect(stopOfAnswer(answer)).toEqual(noPlanStop());
    }
  });
});
