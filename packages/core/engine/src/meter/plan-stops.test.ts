import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  concurrencyStop,
  isPlanStop,
  memberLimitStop,
  memberRemovedStop,
  noPlanStop,
  planLimitStop,
  type ReachedLimit,
  suspendedStop,
} from "./plan-stops.ts";

const reached: ReachedLimit = {
  unit: "cost",
  used: 5.2,
  limit: 5,
  currency: "EUR",
  resetsAt: "2026-12-01T00:00:00.000Z",
  plan: { id: "pro", version: 3, name: "Pro" },
  canUpgrade: true,
};

verifies("engine.plan-stops", () => {
  describe("a unit's limit", () => {
    it("has the code plan.<unit> and the plan in its detail", () => {
      expect(planLimitStop(reached)).toEqual({
        error: "Plan limit reached: 5.2 of 5 EUR used.",
        cause: {
          kind: "limit_reached",
          code: "plan.cost",
          detail: {
            unit: "cost",
            used: "5.2",
            limit: "5",
            currency: "EUR",
            resetsAt: "2026-12-01T00:00:00.000Z",
            planId: "pro",
            planVersion: "3",
            planName: "Pro",
            canUpgrade: "true",
          },
        },
      });
    });

    it("says what a refused reservation needed and what was left", () => {
      const { currency: _currency, ...inMinutes } = reached;
      const stop = planLimitStop({
        ...inMinutes,
        unit: "harnessMinutes",
        reserve: { needed: 30, left: 12 },
      });
      expect(stop.error).toBe(
        "Plan limit reached: the step needs up to 30 harnessMinutes, and 12 is left.",
      );
      expect(stop.cause.code).toBe("plan.harnessMinutes");
      expect(stop.cause.detail).toMatchObject({ phase: "reserve", needed: "30", left: "12" });
      expect(stop.cause.detail).not.toHaveProperty("currency");
    });

    it("refuses a unit that isn't one word or is another code's word", () => {
      for (const unit of ["concurrency", "none", "suspended", "member", "cost.month", "Cost", ""]) {
        expect(() => planLimitStop({ ...reached, unit })).toThrow(RangeError);
      }
    });
  });

  it("never offers a member an upgrade of the organisation's plan", () => {
    const stop = memberLimitStop({ ...reached, used: 50, limit: 50 });
    expect(stop.cause.code).toBe("plan.member.cost");
    expect(stop.cause.detail).toMatchObject({ canUpgrade: "false", used: "50", limit: "50" });
  });

  it("says in a member's stop when a reservation was refused, as its detail does", () => {
    const stop = memberLimitStop({ ...reached, reserve: { needed: 30, left: 12 } });
    expect(stop.cause.detail).toMatchObject({ phase: "reserve", needed: "30", left: "12" });
    expect(stop.error).toContain("needs up to 30");
    expect(stop.error).toContain("12 is left");
  });

  it("names the cap a run start hit", () => {
    expect(concurrencyStop(3, 3, "member").cause).toEqual({
      kind: "limit_reached",
      code: "plan.concurrency",
      detail: { running: "3", limit: "3", cap: "member" },
    });
  });

  it("has codes for no plan, an inactive customer and a removed member", () => {
    expect(noPlanStop().cause).toEqual({ kind: "limit_reached", code: "plan.none" });
    expect(suspendedStop().cause).toEqual({ kind: "limit_reached", code: "plan.suspended" });
    expect(memberRemovedStop().cause).toEqual({
      kind: "limit_reached",
      code: "plan.member-removed",
    });
  });

  it("keeps the seller's budgets and a step's own limits final", () => {
    for (const code of [
      "budget.run",
      "budget.month",
      "harness.max-steps",
      "harness.max-minutes",
      "harness.max-cost",
    ]) {
      expect(isPlanStop({ kind: "limit_reached", code })).toBe(false);
    }
    expect(isPlanStop(planLimitStop(reached).cause)).toBe(true);
    expect(isPlanStop({ kind: "denied", code: "plan.cost" })).toBe(false);
  });
});
