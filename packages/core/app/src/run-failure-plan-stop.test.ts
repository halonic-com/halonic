import type { RunFailureCause } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type RunFailedEvent, runFailureOf } from "./run-failure.ts";

verifies("app.run-failure-plan-stop", () => {
  /** A `budget` run whose cause is `cause`, with the engine's sentence for it. */
  function stoppedBy(
    cause: RunFailureCause,
    error = "Plan limit reached: 5 of 5 EUR used.",
  ): RunFailedEvent {
    return {
      runId: "01JD8Q",
      seq: 9,
      at: "2026-11-10T09:00:00.000Z",
      type: "run.failed",
      state: "draft",
      error,
      reason: "budget",
      cause,
    };
  }

  it("gives a meter's plan.cost stop the engine's message, with its cause known", () => {
    const failed = stoppedBy({
      kind: "limit_reached",
      code: "plan.cost",
      detail: { unit: "cost", used: "5", limit: "5", currency: "EUR", canUpgrade: "true" },
    });
    expect(runFailureOf(failed, undefined)).toEqual({
      reason: "error",
      message: "Plan limit reached: 5 of 5 EUR used.",
      causeKnown: true,
    });
  });

  it("does the same for every other plan. code", () => {
    const codes = [
      "plan.member.cost",
      "plan.concurrency",
      "plan.none",
      "plan.suspended",
      "plan.member-removed",
    ];
    for (const code of codes) {
      const failed = stoppedBy(
        { kind: "limit_reached", code },
        `The meter's sentence for ${code}.`,
      );
      expect(runFailureOf(failed, undefined), code).toEqual({
        reason: "error",
        message: `The meter's sentence for ${code}.`,
        causeKnown: true,
      });
    }
  });

  it("keeps the workspace's own budget stop as budget", () => {
    const failed = stoppedBy(
      {
        kind: "limit_reached",
        code: "budget.run",
        detail: { limit: "5", spent: "5.08", currency: "EUR" },
      },
      "Run budget reached: 5.08 of 5.00 EUR spent.",
    );
    expect(runFailureOf(failed, undefined)).toEqual({
      reason: "budget",
      per: "run",
      budget: 5,
      spent: 5.08,
      currency: "EUR",
    });
  });
});
