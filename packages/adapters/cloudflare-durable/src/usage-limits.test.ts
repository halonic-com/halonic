import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeLimits, openAccount, period, step } from "./test/usage-case.ts";
import { reservationMarginMs } from "./usage-account.ts";
import { chargedPruneBatch } from "./usage-charged.ts";

const nextPeriod = { start: period.end, end: Date.UTC(2027, 0, 1) };
const laterPeriod = { start: nextPeriod.end, end: Date.UTC(2027, 1, 1) };
const owner = { runId: "run_1", actor: "u_acme" };

verifies("cloudflare-durable.usage-limits", () => {
  it("refuses everything while it knows no limits", () => {
    const { account } = openAccount(null);
    expect(account.check("u_acme")).toEqual({ allowed: false, refusal: { code: "plan.none" } });
    expect(account.reserve(step("res_1"))).toMatchObject({ refusal: { code: "plan.none" } });
  });

  it("keeps a document only when its version is newer than the one it has", () => {
    const { account } = openAccount(acmeLimits({ version: 2 }));
    expect(account.applyLimits(acmeLimits({ version: 2, status: "stopped" }))).toBe("stale");
    expect(account.applyLimits(acmeLimits({ version: 1, status: "stopped" }))).toBe("stale");
    expect(account.check("u_acme").allowed).toBe(true);
    expect(account.applyLimits(acmeLimits({ version: 3, status: "stopped" }))).toBe("applied");
    expect(account.check("u_acme")).toMatchObject({ refusal: { code: "plan.inactive" } });
  });

  it("refuses a document with an amount, a member or a period that isn't valid", () => {
    const { account } = openAccount();
    const wrong = [
      acmeLimits({ version: 2, limits: { cost: -1 } }),
      acmeLimits({ version: 2, members: { "Ada Lovelace": { status: "active" } } }),
      acmeLimits({ version: 2, period: { start: period.end, end: period.start } }),
      acmeLimits({ version: 2.5 }),
      acmeLimits({ version: 2, members: { u_ada: { status: "active", maxRunning: Number.NaN } } }),
      acmeLimits({ version: 2, members: JSON.parse('{"__proto__": {"status": "active"}}') }),
      acmeLimits({ version: 2, maxRunning: -1 }),
      acmeLimits({ version: 2, members: { u_ada: { status: "active", maxRunning: -1 } } }),
      { ...acmeLimits({ version: 2 }), defaultReserve: undefined } as never,
    ];
    for (const limits of wrong) expect(() => account.applyLimits(limits)).toThrow(RangeError);
    expect(account.applyLimits(acmeLimits({ version: 2 }))).toBe("applied");
  });

  describe("the period", () => {
    it("starts again only on a document for a later period, never because time passed", () => {
      const { account, clock } = openAccount();
      account.record("call_1", { runId: "run_1", actor: "u_acme" }, "model_call", { cost: 1_000 });
      clock.nowMs = nextPeriod.start + 1;
      expect(account.check("u_acme")).toMatchObject({
        refusal: { code: "plan.cost", used: 1_000 },
      });

      account.applyLimits(acmeLimits({ version: 2 }));
      expect(account.check("u_acme").allowed).toBe(false);
      account.applyLimits(acmeLimits({ version: 3, period: nextPeriod }));
      expect(account.check("u_acme")).toEqual({ allowed: true });
    });

    it("counts from zero in the new period, keeping only what is still reserved", () => {
      const { account } = openAccount();
      account.reserve(step("res_1", { cost: 700 }));
      account.record("call_1", { runId: "run_1", actor: "u_acme" }, "model_call", { cost: 200 });
      account.applyLimits(acmeLimits({ version: 2, period: nextPeriod }));
      expect(account.reserve(step("res_2", { cost: 400 })).allowed).toBe(false);
      expect(account.settle("res_1", { cost: 50 })).toBe("settled");
      expect(account.reserve(step("res_2", { cost: 900 })).allowed).toBe(true);
    });

    it("corrects a step that ran out just before a new period in the period it was charged", () => {
      const { account, clock, outbox } = openAccount();
      account.reserve(step("res_1", { cost: 600 }));
      clock.nowMs += 60_000 + reservationMarginMs;
      account.settleExpired();
      account.applyLimits(acmeLimits({ version: 2, period: nextPeriod }));
      account.record("call_1", owner, "model_call", { cost: 900 });

      expect(account.settle("res_1", { cost: 100 })).toBe("corrected");
      expect(account.settle("res_1", { cost: 100 })).toBe("already-settled");
      const late = outbox().find((row) => row.kind === "usage" && row.record.id === "res_1:late");
      expect(late).toMatchObject({ record: { units: { cost: -500 }, periodStart: period.start } });
      // The new period's use stays 900: the old period's correction frees none of it.
      expect(account.reserve(step("res_2", { cost: 200 })).allowed).toBe(false);
    });

    it("counts a record that comes again after a new period starts once", () => {
      const { account } = openAccount();
      account.record("call_1", owner, "model_call", { cost: 600 });
      account.applyLimits(acmeLimits({ version: 2, period: nextPeriod }));
      account.record("call_1", owner, "model_call", { cost: 600 });
      expect(account.reserve(step("res_1", { cost: 1_000 })).allowed).toBe(true);
      expect(() => account.reserve(step("call_1"))).toThrow(RangeError);
    });

    it("forgets ids two periods old, a batch at a time", () => {
      const { account, storage } = openAccount();
      for (let n = 0; n <= chargedPruneBatch; n++) account.record(`call_${n}`, owner, "run", {});
      account.applyLimits(acmeLimits({ version: 2, period: nextPeriod }));
      account.applyLimits(acmeLimits({ version: 3, period: laterPeriod }));
      expect([...storage.list("charged:")]).toHaveLength(1);
      account.settleExpired();
      expect([...storage.list("charged:")]).toHaveLength(0);
    });
  });

  describe("an organisation", () => {
    const members = {
      u_ada: { status: "active", shares: { cost: 300 } },
      u_bo: { status: "removed" },
    } as const;

    it("refuses a member who isn't active, and an actor it doesn't list", () => {
      const { account } = openAccount(acmeLimits({ members }));
      for (const actor of ["u_bo", "u_cy"]) {
        expect(account.check(actor)).toMatchObject({ refusal: { code: "plan.member.inactive" } });
      }
    });

    it("checks the member's share and the pool in the same reservation", () => {
      const { account } = openAccount(acmeLimits({ members }));
      expect(account.reserve(step("res_1", { cost: 200 }, "u_ada")).allowed).toBe(true);
      expect(account.reserve(step("res_2", { cost: 200 }, "u_ada"))).toMatchObject({
        refusal: { code: "plan.member.cost", used: 200, limit: 300, needed: 200, left: 100 },
      });
    });
  });
});
