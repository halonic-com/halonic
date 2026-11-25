import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeLimits, openAccount, period, step } from "./test/usage-case.ts";
import type { UsageLimits } from "./usage-types.ts";

const owner = { runId: "run_1", actor: "u_acme" };
const tenOClock = period.start + 10 * 60 * 60 * 1_000;

verifies("cloudflare-durable.usage-overrides", () => {
  describe("overrides", () => {
    it("uses an override's amount until its end, then the plan's limit, by its own clock", () => {
      const overrides = [{ unit: "cost" as const, amount: 200, until: tenOClock }];
      const { account, clock } = openAccount(acmeLimits({ overrides }));
      clock.nowMs = tenOClock - 1;
      expect(account.reserve(step("res_1", { cost: 300 }))).toMatchObject({
        allowed: false,
        refusal: { code: "plan.cost", limit: 200 },
      });
      clock.nowMs = tenOClock;
      expect(account.reserve(step("res_1", { cost: 300 }))).toEqual({ allowed: true });
    });

    it("keeps an override with no end", () => {
      const overrides = [{ unit: "cost" as const, amount: 2_000, until: null }];
      const { account, clock } = openAccount(acmeLimits({ overrides }));
      clock.nowMs = period.end - 1;
      expect(account.reserve(step("res_1", { cost: 1_500 }))).toEqual({ allowed: true });
    });

    it("neither adds nor lifts a limit for a unit the plan doesn't limit", () => {
      const overrides = [{ unit: "tokens" as const, amount: 10, until: null }];
      const { account } = openAccount(acmeLimits({ overrides }));
      expect(account.reserve(step("res_1", { cost: 100, tokens: 50 }))).toEqual({ allowed: true });
    });

    it("counts thresholds and the summary against the override", () => {
      const overrides = [{ unit: "cost" as const, amount: 500, until: null }];
      const { account, outbox } = openAccount(acmeLimits({ overrides }));
      account.record("call_1", owner, "model_call", { cost: 400 });
      expect(account.summary().costPercent).toBe(80);
      expect(outbox()).toContainEqual(expect.objectContaining({ kind: "threshold", limit: 500 }));
    });

    it("refuses a document with an override that isn't valid", () => {
      const { account } = openAccount();
      const wrong: unknown[] = [
        [{ unit: "minutes", amount: 1, until: null }],
        [{ unit: "cost", amount: -1, until: null }],
        [{ unit: "cost", amount: 1.5, until: null }],
        [{ unit: "cost", amount: 1, until: "2026-11-01T10:00:00Z" }],
        [{ unit: "cost", amount: 1 }],
        [
          { unit: "cost", amount: 1, until: null },
          { unit: "cost", amount: 2, until: null },
        ],
        { unit: "cost", amount: 1, until: null },
      ];
      for (const overrides of wrong) {
        const limits = acmeLimits({
          version: 2,
          overrides: overrides as NonNullable<UsageLimits["overrides"]>,
        });
        expect(() => account.applyLimits(limits)).toThrow(RangeError);
      }
      const upgradable = acmeLimits({ version: 2, upgradable: ["minutes"] as never });
      expect(() => account.applyLimits(upgradable)).toThrow(RangeError);
    });
  });

  describe("status", () => {
    it("refuses with plan.none while the customer has no plan", () => {
      const { account } = openAccount(acmeLimits({ status: "none" }));
      expect(account.check("u_acme")).toEqual({ allowed: false, refusal: { code: "plan.none" } });
      expect(account.reserve(step("res_1"))).toMatchObject({ refusal: { code: "plan.none" } });
      expect(account.startRun("run_1", "u_acme")).toMatchObject({ refusal: { code: "plan.none" } });
    });

    it("refuses a document whose status isn't one it knows", () => {
      const { account } = openAccount();
      const unknown = acmeLimits({ version: 2, status: "paused" as never });
      expect(() => account.applyLimits(unknown)).toThrow(RangeError);
      expect(account.check("u_acme").allowed).toBe(true);
    });
  });

  describe("upgrade", () => {
    it("says whether a bigger plan raises the pool's limit, never a member's share", () => {
      const members = { u_ada: { status: "active" as const, shares: { cost: 300 } } };
      const { account } = openAccount(acmeLimits({ upgradable: ["cost"], members }));
      expect(account.reserve(step("res_1", { cost: 400 }, "u_ada"))).toMatchObject({
        refusal: { code: "plan.member.cost" },
      });
      const member = account.reserve(step("res_1", { cost: 400 }, "u_ada"));
      expect(member.allowed === false && "canUpgrade" in member.refusal).toBe(false);

      const pool = openAccount(acmeLimits({ upgradable: ["cost"] })).account;
      expect(pool.reserve(step("res_2", { cost: 1_100 }))).toMatchObject({
        refusal: { code: "plan.cost", canUpgrade: true },
      });
      const fixed = openAccount(acmeLimits({ upgradable: [] })).account;
      expect(fixed.reserve(step("res_3", { cost: 1_100 }))).toMatchObject({
        refusal: { code: "plan.cost", canUpgrade: false },
      });
    });
  });
});
